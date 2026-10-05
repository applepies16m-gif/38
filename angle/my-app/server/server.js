const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const { connectToDatabase, getDb } = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- Image uploads: settings and helpers ---

// Uploaded images are saved in this folder and served from /uploads.
// Only the short path (e.g. /uploads/3f9a...c2.png) is stored in
// MongoDB, never the image itself.
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif' };
const IMAGE_TYPE_MESSAGE = 'Choose a JPEG, PNG or GIF image.';
const IMAGE_SIZE_MESSAGE = 'Images must be 2 MB or smaller.';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// multer reads the uploaded file out of the request. The file is
// held in memory (at most 2 MB) so its contents can be checked
// before anything is written to disk.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    callback(null, Boolean(IMAGE_EXTENSIONS[file.mimetype]));
  }
});

// Works out what kind of image a file really is from its first
// bytes, which are fixed for each format. The type the browser
// declares can be faked, so this is what the server trusts.
// Returns the type, or null if it is none of the three allowed.
function detectImageType(buffer) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)) {
    return 'image/png';
  }
  const gifHeader = buffer.subarray(0, 6).toString('latin1');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return 'image/gif';
  }
  return null;
}

// True only for a path this server handed out itself: /uploads/,
// 32 hex characters, and one of the three extensions. This stops a
// message pointing at an outside address, and makes it safe to use
// the path to find the file on disk.
function isUploadedImageUrl(value) {
  return typeof value === 'string' && /^\/uploads\/[a-f0-9]{32}\.(jpg|png|gif)$/.test(value);
}

// Removes an uploaded image file from disk. Used when the message
// it belonged to drops out of the last-5 window.
function deleteUploadedImage(imageUrl) {
  if (!isUploadedImageUrl(imageUrl)) {
    return;
  }
  fs.unlink(path.join(UPLOAD_DIR, path.basename(imageUrl)), () => {});
}

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

// Fields a client may send when creating a user. The role, group
// membership and ban flags are always set by the server instead.
const USER_CREATE_FIELDS = ['username', 'password', 'displayName', 'email', 'dateOfBirth'];

// Fields a client may change on an existing user. The admin pages
// change role and group membership through this same route, so
// those have to stay on the list.
const USER_UPDATE_FIELDS = ['username', 'password', 'displayName', 'role', 'groupIds', 'bannedFromGroupIds', 'dateOfBirth'];

// Shown when a date of birth fails calculateAge's rules.
const INVALID_DATE_OF_BIRTH_MESSAGE = 'Date of birth must be a real date, not in the future and not more than 120 years ago.';

// Returns a copy of source holding only the named fields, so
// anything else a client sends is ignored.
function pickFields(source, allowedFields) {
  const picked = {};
  for (const field of allowedFields) {
    if (source[field] !== undefined) {
      picked[field] = source[field];
    }
  }
  return picked;
}

// Sent to a socket whose join or message was refused.
const CHANNEL_DENIED_MESSAGE = 'You are not a member of this group, or you have been banned from it.';

// Decides whether a user may read and post in a channel: the
// channel and user must exist, the user must not be banned from
// the system, and the channel's group must be in the user's
// groupIds and not in their bannedFromGroupIds. Ids that are
// missing or malformed are refused rather than causing an error.
async function canUseChannel(userId, channelId) {
  if (typeof userId !== 'string' || typeof channelId !== 'string') {
    return false;
  }
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(channelId)) {
    return false;
  }
  const channel = await getDb().collection('channels').findOne({ _id: new ObjectId(channelId) });
  const user = await getDb().collection('users').findOne({ _id: new ObjectId(userId) });
  if (!channel || !user || user.isSystemBanned) {
    return false;
  }
  const isMember = (user.groupIds || []).includes(channel.groupId);
  const isBanned = (user.bannedFromGroupIds || []).includes(channel.groupId);
  return isMember && !isBanned;
}

// A date of birth further back than this is treated as a mistake.
const MAX_AGE_YEARS = 120;

// Reads a date of birth written as YYYY-MM-DD and returns its
// year, month and day as numbers, or null if it isn't a real
// calendar date. The parts are read straight from the text so the
// server's time zone can't shift the day.
function parseDateOfBirth(dateOfBirth) {
  if (typeof dateOfBirth !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // A date that doesn't exist rolls over when built (2023-02-29
  // becomes 1 March), so if the parts read back differently the
  // date was never real.
  const built = new Date(Date.UTC(year, month - 1, day));
  if (built.getUTCFullYear() !== year || built.getUTCMonth() !== month - 1 || built.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

// Returns the age in whole years today, or null if the date of
// birth is missing, not a real date, in the future, or more than
// MAX_AGE_YEARS ago.
function calculateAge(dateOfBirth) {
  const parts = parseDateOfBirth(dateOfBirth);
  if (!parts) {
    return null;
  }
  const today = new Date();
  const thisMonth = today.getMonth() + 1;
  const birthdayPassed = thisMonth > parts.month ||
    (thisMonth === parts.month && today.getDate() >= parts.day);

  let age = today.getFullYear() - parts.year;
  if (!birthdayPassed) {
    age = age - 1;
  }
  if (age < 0 || age > MAX_AGE_YEARS) {
    return null;
  }
  return age;
}

// Looks up the user and group for a join request. Either comes
// back null if its id is malformed or nothing matches.
async function findUserAndGroup(userId, groupId) {
  const isId = value => typeof value === 'string' && ObjectId.isValid(value);
  const user = isId(userId)
    ? await getDb().collection('users').findOne({ _id: new ObjectId(userId) })
    : null;
  const group = isId(groupId)
    ? await getDb().collection('groups').findOne({ _id: new ObjectId(groupId) })
    : null;
  return { user, group };
}

// Every rule for whether a user may join a group, in one place so
// submitting a request and approving it can't disagree. Returns
// null if the user may join, or the HTTP status and reason if not.
function checkJoinAllowed(user, group) {
  const groupId = group._id.toString();
  if (user.isSystemBanned) {
    return { status: 403, message: 'This account has been banned from the system.' };
  }
  if ((user.bannedFromGroupIds || []).includes(groupId)) {
    return { status: 403, message: 'Banned from this group.' };
  }
  if ((user.groupIds || []).includes(groupId)) {
    return { status: 409, message: 'Already a member of this group.' };
  }
  if (group.ageLimit > 0) {
    const age = calculateAge(user.dateOfBirth);
    if (age === null) {
      return { status: 403, message: `This group is for ages ${group.ageLimit}+ and the account has no valid date of birth.` };
    }
    if (age < group.ageLimit) {
      return { status: 403, message: `This group is for ages ${group.ageLimit}+.` };
    }
  }
  return null;
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
  const body = req.body || {};
  const fields = pickFields(body, USER_CREATE_FIELDS);

  // A date of birth is optional (accounts made by an admin may not
  // have one), so it is only checked when one was sent. An empty
  // value counts as not sent and is not stored.
  if (!fields.dateOfBirth) {
    delete fields.dateOfBirth;
  } else if (calculateAge(fields.dateOfBirth) === null) {
    return res.status(400).json({ message: INVALID_DATE_OF_BIRTH_MESSAGE });
  }

  // Only the whitelisted fields are kept. Every new account starts
  // as a plain user in no groups, whatever the client sent.
  const newUser = {
    ...fields,
    username: (body.username || '').toLowerCase(),
    role: 'user',
    online: false,
    groupIds: [],
    bannedFromGroupIds: [],
    isSystemBanned: false
  };
  const result = await getDb().collection('users').insertOne(newUser);
  res.status(201).json(toClientShape({ ...newUser, _id: result.insertedId }));
});

app.delete('/api/users/:id', async (req, res) => {
  await getDb().collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).send();
});

app.put('/api/users/:id', async (req, res) => {
  const updates = pickFields(req.body || {}, USER_UPDATE_FIELDS);
  // MongoDB rejects an empty $set, so answer clearly instead.
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update.' });
  }

  // A date of birth can be set once. It is accepted only if the
  // new value is valid and the account doesn't already hold a
  // valid one, so a user can't change their age to get past a
  // group's age limit.
  if (updates.dateOfBirth !== undefined) {
    if (calculateAge(updates.dateOfBirth) === null) {
      return res.status(400).json({ message: INVALID_DATE_OF_BIRTH_MESSAGE });
    }
    const existing = ObjectId.isValid(req.params.id)
      ? await getDb().collection('users').findOne({ _id: new ObjectId(req.params.id) })
      : null;
    if (!existing) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (calculateAge(existing.dateOfBirth) !== null) {
      return res.status(400).json({ message: 'Date of birth has already been set and cannot be changed.' });
    }
  }

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
  const { userId, groupId } = req.body || {};
  const { user, group } = await findUserAndGroup(userId, groupId);
  if (!user || !group) {
    return res.status(404).json({ message: 'User or group not found.' });
  }

  const refusal = checkJoinAllowed(user, group);
  if (refusal) {
    return res.status(refusal.status).json({ message: refusal.message });
  }

  // One pending request per user per group. A request that was
  // rejected earlier doesn't block a new one.
  const pending = await getDb().collection('joinRequests').findOne({ userId, groupId, status: 'pending' });
  if (pending) {
    return res.status(409).json({ message: 'There is already a pending request for this group.' });
  }

  const newRequest = { userId, groupId, status: 'pending' };
  const result = await getDb().collection('joinRequests').insertOne(newRequest);
  res.status(201).json(toClientShape({ ...newRequest, _id: result.insertedId }));
});

app.put('/api/join-requests/:id', async (req, res) => {
  const { status, rejectionReason } = req.body || {};
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Join request not found.' });
  }
  const requestId = new ObjectId(req.params.id);
  const joinRequests = getDb().collection('joinRequests');

  if (status === 'approved') {
    const request = await joinRequests.findOne({ _id: requestId });
    if (!request) {
      return res.status(404).json({ message: 'Join request not found.' });
    }

    // The rules are checked again here, because the user may have
    // been banned, or the age limit raised, while the request was
    // waiting. A request that no longer passes is rejected with the
    // reason, and the admin is told, rather than failing quietly.
    const { user, group } = await findUserAndGroup(request.userId, request.groupId);
    const refusal = (!user || !group)
      ? { message: 'The user or group no longer exists.' }
      : checkJoinAllowed(user, group);
    if (refusal) {
      await joinRequests.updateOne(
        { _id: requestId },
        { $set: { status: 'rejected', rejectionReason: refusal.message } }
      );
      return res.status(409).json({ message: refusal.message });
    }

    await joinRequests.updateOne({ _id: requestId }, { $set: { status: 'approved' } });
    await getDb().collection('users').updateOne(
      { _id: user._id },
      { $addToSet: { groupIds: request.groupId } }
    );
    return res.status(204).send();
  }

  await joinRequests.updateOne(
    { _id: requestId },
    { $set: { status, rejectionReason } }
  );
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
  // The same membership rule as the sockets, so a user who can't
  // join a channel can't read its history either.
  if (!channelId || !(await canUseChannel(req.query.userId, channelId))) {
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

// --- Image upload ---

// Accepts one image in the form field "image", checks it, saves it
// under a random name and answers with the path to store in a
// message.
app.post('/api/upload', (req, res) => {
  imageUpload.single('image')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? IMAGE_SIZE_MESSAGE : 'The image could not be uploaded.';
      return res.status(400).json({ message });
    }
    // No file means none was sent, or the filter turned it away
    // because of its declared type.
    if (!req.file) {
      return res.status(400).json({ message: IMAGE_TYPE_MESSAGE });
    }
    const realType = detectImageType(req.file.buffer);
    if (!realType) {
      return res.status(400).json({ message: IMAGE_TYPE_MESSAGE });
    }

    const fileName = crypto.randomBytes(16).toString('hex') + IMAGE_EXTENSIONS[realType];
    await fs.promises.writeFile(path.join(UPLOAD_DIR, fileName), req.file.buffer);
    res.status(201).json({ imageUrl: '/uploads/' + fileName });
  });
});

// --- Sockets ---

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('joinChannel', async ({ channelId, userId, username } = {}) => {
    // A refused join stores nothing and announces nothing; only
    // the refused socket is told.
    if (!(await canUseChannel(userId, channelId))) {
      socket.emit('channelDenied', { channelId, message: CHANNEL_DENIED_MESSAGE });
      return;
    }

    // Remembered only once the check has passed. sendMessage and
    // the leave notices rely on these instead of what the client
    // sends later.
    socket.data.channelId = channelId;
    socket.data.userId = userId;
    socket.data.username = username;
    socket.join(channelId);
    socket.to(channelId).emit('userJoined', {
      channelId,
      username,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('leaveChannel', ({ channelId } = {}) => {
    // Only announce a leave for a socket that really was in the
    // room, so a refused user never produces a "left" notice.
    if (!socket.rooms.has(channelId)) {
      return;
    }
    socket.leave(channelId);
    socket.to(channelId).emit('userLeft', {
      channelId,
      username: socket.data.username,
      timestamp: new Date().toISOString()
    });
  });

 socket.on('sendMessage', async (message = {}) => {
  // The sender is the user this socket joined as, not whatever id
  // the message claims. The socket must be in the channel's room
  // and the user must still be allowed in it -- a ban can arrive
  // while the channel is open.
  const userId = socket.data.userId;
  const inRoom = socket.rooms.has(message.channelId);
  if (!inRoom || !(await canUseChannel(userId, message.channelId))) {
    if (inRoom) {
      socket.leave(message.channelId);
    }
    socket.emit('channelDenied', { channelId: message.channelId, message: CHANNEL_DENIED_MESSAGE });
    return;
  }

  const toSave = { ...message, senderId: userId };

  // An image is kept only if it is a path this server handed out.
  // A message needs some text or an image; an empty one is dropped.
  if (!isUploadedImageUrl(toSave.imageUrl)) {
    delete toSave.imageUrl;
  }
  const hasText = typeof toSave.text === 'string' && toSave.text.trim() !== '';
  if (!hasText && !toSave.imageUrl) {
    return;
  }

  const result = await getDb().collection('messages').insertOne(toSave);
  const saved = { ...toSave, id: result.insertedId.toString() };
  io.to(message.channelId).emit('newMessage', saved);

  // Enforce the "only the last 5 messages are stored" rule: find
  // every message in this channel, oldest first, and delete any
  // beyond the 5 most recent.
  const allForChannel = await getDb().collection('messages')
    .find({ channelId: message.channelId })
    .sort({ _id: 1 })
    .toArray();

  if (allForChannel.length > 5) {
    const oldMessages = allForChannel.slice(0, allForChannel.length - 5);
    const idsToDelete = oldMessages.map(m => m._id);
    await getDb().collection('messages').deleteMany({ _id: { $in: idsToDelete } });
    // An image whose message is gone would never be shown again,
    // so remove its file too.
    for (const oldMessage of oldMessages) {
      deleteUploadedImage(oldMessage.imageUrl);
    }
  }
});

  // 'disconnecting' fires while the socket is still in its rooms.
  // By the time 'disconnect' fires socket.rooms is already empty,
  // so the "was it really in the room" check could never pass there.
  socket.on('disconnecting', () => {
    if (socket.data.channelId && socket.rooms.has(socket.data.channelId)) {
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