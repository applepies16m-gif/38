const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { ObjectId } = require('mongodb');
const { connectToDatabase, getDb } = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Socket.io needs a raw Node HTTP server to attach to -- Express's
// app object alone isn't enough, since sockets work at a lower
// level than a single request/response cycle.
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:4200' }
});

function toClientShape(doc) {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id.toString() };
}
// --- Bootstrap ---

// Tells the frontend whether the very first Super Admin still needs
// to be created. True only when the users collection is completely
// empty -- the moment one user exists, this permanently returns
// false, which is what "disables" the bootstrap process.
app.get('/api/bootstrap-status', async (req, res) => {
  const userCount = await getDb().collection('users').countDocuments();
  res.json({ needsBootstrap: userCount === 0 });
});

app.post('/api/bootstrap', async (req, res) => {
  const userCount = await getDb().collection('users').countDocuments();
  if (userCount > 0) {
    // Server-side enforcement, not just a UI check -- someone
    // calling this endpoint directly after real users already
    // exist should never be able to create another "first" admin.
    return res.status(403).json({ message: 'Bootstrap already completed.' });
  }

  const newSuperAdmin = {
    ...req.body,
    username: (req.body.username || '').toLowerCase(),
    role: 'super_admin'
  };
  const result = await getDb().collection('users').insertOne(newSuperAdmin);
  res.status(201).json(toClientShape({ ...newSuperAdmin, _id: result.insertedId }));
});
// --- Users ---

app.get('/api/users', async (req, res) => {
  const users = await getDb().collection('users').find().toArray();
  res.json(users.map(toClientShape));
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await getDb().collection('users').findOne({
    username: (username || '').toLowerCase()
  });

  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  const { password: _pw, ...safeUser } = toClientShape(user);
  res.json(safeUser);
});

app.post('/api/users', async (req, res) => {
  const newUser = {
    ...req.body,
    username: (req.body.username || '').toLowerCase()
  };
  const result = await getDb().collection('users').insertOne(newUser);
  res.status(201).json(toClientShape({ ...newUser, _id: result.insertedId }));
});

app.delete('/api/users/:id', async (req, res) => {
  await getDb().collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).send();
});

// --- Groups ---

app.get('/api/groups', async (req, res) => {
  const groups = await getDb().collection('groups').find().toArray();
  res.json(groups.map(toClientShape));
});

app.post('/api/groups', async (req, res) => {
  const result = await getDb().collection('groups').insertOne(req.body);
  res.status(201).json(toClientShape({ ...req.body, _id: result.insertedId }));
});
// --- Join Requests ---

app.get('/api/join-requests', async (req, res) => {
  const requests = await getDb().collection('joinRequests').find().toArray();
  res.json(requests.map(toClientShape));
});

app.post('/api/join-requests', async (req, res) => {
  const newRequest = { ...req.body, status: 'pending' };
  const result = await getDb().collection('joinRequests').insertOne(newRequest);
  res.status(201).json(toClientShape({ ...newRequest, _id: result.insertedId }));
});

app.put('/api/join-requests/:id', async (req, res) => {
  const { status, rejectionReason } = req.body;
  await getDb().collection('joinRequests').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status, rejectionReason } }
  );

  if (status === 'approved') {
    // Add the requesting user to the group's member list.
    const request = await getDb().collection('joinRequests').findOne({ _id: new ObjectId(req.params.id) });
    await getDb().collection('users').updateOne(
      { _id: new ObjectId(request.userId) },
      { $addToSet: { groupIds: request.groupId } }
    );
  }

  res.status(204).send();
});
// --- Group Requests ---

app.get('/api/group-requests', async (req, res) => {
  const requests = await getDb().collection('groupRequests').find().toArray();
  res.json(requests.map(toClientShape));
});

app.post('/api/group-requests', async (req, res) => {
  const newRequest = { ...req.body, status: 'pending' };
  const result = await getDb().collection('groupRequests').insertOne(newRequest);
  res.status(201).json(toClientShape({ ...newRequest, _id: result.insertedId }));
});

app.put('/api/group-requests/:id', async (req, res) => {
  const { status, rejectionReason } = req.body;
  await getDb().collection('groupRequests').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status, rejectionReason } }
  );
  res.status(204).send();
});
// --- Sockets ---

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // A "room" in Socket.io is just a named group of connected
  // sockets -- joining a room lets us broadcast only to people
  // currently viewing that specific channel, not everyone connected
  // to the server.
  socket.on('joinChannel', ({ channelId, username }) => {
    socket.data.channelId = channelId;
    socket.data.username = username;
    socket.join(channelId);
    socket.to(channelId).emit('userJoined', {
      channelId,
      username,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('leaveChannel', ({ channelId, username }) => {
    socket.leave(channelId);
    socket.to(channelId).emit('userLeft', {
      channelId,
      username,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('sendMessage', async (message) => {
    // Persist to MongoDB first, then broadcast -- so a message
    // sent while someone else is offline is still there when they
    // next load the channel, not just something that flew past.
    const result = await getDb().collection('messages').insertOne(message);
    const saved = { ...message, id: result.insertedId.toString() };
    io.to(message.channelId).emit('newMessage', saved);
  });

  // Fires automatically if the browser tab is closed or the
  // connection drops -- not just on an explicit "leave" click. This
  // stops a channel silently believing someone is still present
  // after they've actually gone.
  socket.on('disconnect', () => {
    if (socket.data.channelId && socket.data.username) {
      socket.to(socket.data.channelId).emit('userLeft', {
        channelId: socket.data.channelId,
        username: socket.data.username,
        timestamp: new Date().toISOString()
      });
    }
  });
});

connectToDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Fabulari server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err.message);
});