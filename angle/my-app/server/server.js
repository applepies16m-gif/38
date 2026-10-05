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

// Returns a message's timestamp as an ISO string. Messages saved
// before timestamps were standardised hold display text such as
// "01:47 PM", which isn't a real date, so for those the creation
// time MongoDB stores inside every _id is used instead.
function resolveTimestamp(doc) {
  const parsed = new Date(doc.timestamp);
  if (isNaN(parsed.getTime())) {
    return doc._id.getTimestamp().toISOString();
  }
  return doc.timestamp;
}

// --- Bootstrap ---

app.get('/api/bootstrap-status', async (req, res) => {
  const userCount = await getDb().collection('users').countDocuments();
  res.json({ needsBootstrap: userCount === 0 });
});

app.post('/api/bootstrap', async (req, res) => {
  const userCount = await getDb().collection('users').countDocuments();
  if (userCount > 0) {
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

app.put('/api/users/:id', async (req, res) => {
  const updates = { ...req.body };
  delete updates.id;
  await getDb().collection('users').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: updates }
  );
  res.status(204).send();
});

// --- Groups ---

app.get('/api/groups', async (req, res) => {
  const groups = await getDb().collection('groups').find().toArray();
  res.json(groups.map(toClientShape));
});

app.post('/api/groups', async (req, res) => {
  const result = await getDb().collection('groups').insertOne(req.body);
  const newGroup = toClientShape({ ...req.body, _id: result.insertedId });

  // Every group needs somewhere to chat from the moment it exists,
  // rather than requiring a separate manual step to add the first
  // channel.
  await getDb().collection('channels').insertOne({
    name: 'general',
    groupId: newGroup.id
  });

  res.status(201).json(newGroup);
});

app.put('/api/groups/:id', async (req, res) => {
  const updates = { ...req.body };
  delete updates.id;
  await getDb().collection('groups').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: updates }
  );
  res.status(204).send();
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
// --- Room Requests ---

app.get('/api/room-requests', async (req, res) => {
  const requests = await getDb().collection('roomRequests').find().toArray();
  res.json(requests.map(toClientShape));
});

app.post('/api/room-requests', async (req, res) => {
  const newRequest = { ...req.body, status: 'pending' };
  const result = await getDb().collection('roomRequests').insertOne(newRequest);
  res.status(201).json(toClientShape({ ...newRequest, _id: result.insertedId }));
});

app.put('/api/room-requests/:id', async (req, res) => {
  const { status, rejectionReason } = req.body;
  await getDb().collection('roomRequests').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status, rejectionReason } }
  );

  if (status === 'approved') {
    // Approving a room request actually creates the real channel.
    const request = await getDb().collection('roomRequests').findOne({ _id: new ObjectId(req.params.id) });
    await getDb().collection('channels').insertOne({
      name: request.roomName,
      groupId: request.groupId
    });
  }

  res.status(204).send();
});
// --- Ban Requests ---

app.get('/api/ban-requests', async (req, res) => {
  const requests = await getDb().collection('banRequests').find().toArray();
  res.json(requests.map(toClientShape));
});

app.post('/api/ban-requests', async (req, res) => {
  const newRequest = { ...req.body, status: 'pending' };
  const result = await getDb().collection('banRequests').insertOne(newRequest);
  res.status(201).json(toClientShape({ ...newRequest, _id: result.insertedId }));
});

app.put('/api/ban-requests/:id', async (req, res) => {
  const { status, rejectionReason } = req.body;
  await getDb().collection('banRequests').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status, rejectionReason } }
  );

  if (status === 'approved') {
    const request = await getDb().collection('banRequests').findOne({ _id: new ObjectId(req.params.id) });
    const targetUser = await getDb().collection('users').findOne({ _id: new ObjectId(request.targetUserId) });
    const updatedGroupIds = (targetUser.groupIds || []).filter(id => id !== request.groupId);
    const updatedBannedIds = [...(targetUser.bannedFromGroupIds || []), request.groupId];

    await getDb().collection('users').updateOne(
      { _id: new ObjectId(request.targetUserId) },
      { $set: { groupIds: updatedGroupIds, bannedFromGroupIds: updatedBannedIds } }
    );
  }

  res.status(204).send();
});
// --- Channels ---

app.get('/api/channels', async (req, res) => {
  const groupId = req.query.groupId;
  const filter = groupId ? { groupId } : {};
  const channels = await getDb().collection('channels').find(filter).toArray();
  res.json(channels.map(toClientShape));
});

app.post('/api/channels', async (req, res) => {
  const result = await getDb().collection('channels').insertOne(req.body);
  res.status(201).json(toClientShape({ ...req.body, _id: result.insertedId }));
});
// --- Messages ---

app.get('/api/messages', async (req, res) => {
  const channelId = req.query.channelId;
  if (!channelId) {
    return res.json([]);
  }
  // Newest 5 first, then reverse so they display oldest-to-newest,
  // the normal reading order for a chat log.
  const messages = await getDb().collection('messages')
    .find({ channelId })
    .sort({ _id: -1 })
    .limit(5)
    .toArray();
  res.json(messages.reverse().map(doc =>
    toClientShape({ ...doc, timestamp: resolveTimestamp(doc) })
  ));
});

// --- Sockets ---

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

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
  const result = await getDb().collection('messages').insertOne(message);
  const saved = { ...message, id: result.insertedId.toString() };
  io.to(message.channelId).emit('newMessage', saved);

  // Enforce the "only the last 5 messages are stored" rule: find
  // every message in this channel, oldest first, and delete any
  // beyond the 5 most recent.
  const allForChannel = await getDb().collection('messages')
    .find({ channelId: message.channelId })
    .sort({ _id: 1 })
    .toArray();

  if (allForChannel.length > 5) {
    const idsToDelete = allForChannel.slice(0, allForChannel.length - 5).map(m => m._id);
    await getDb().collection('messages').deleteMany({ _id: { $in: idsToDelete } });
  }
});

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