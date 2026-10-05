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
const { hashPassword, passwordMatches, convertPlainTextPasswords } = require('./passwords');

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

// A user as sent to a browser: the same as toClientShape, but
// never with the password, even though it is stored as a hash.
function toSafeUser(doc) {
  const { password, ...safeUser } = toClientShape(doc);
  return safeUser;
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
const USER_CREATE_FIELDS = ['username', 'password', 'firstName', 'lastName', 'displayName', 'email', 'dateOfBirth'];

// Fields a client may change on an existing user. The admin pages
// change role and group membership through this same route, so
// those have to stay on the list.
const USER_UPDATE_FIELDS = ['username', 'password', 'displayName', 'role', 'groupIds', 'bannedFromGroupIds', 'dateOfBirth', 'profilePicUrl', 'isSystemBanned'];

// Fields a client may send when creating or changing a group.
const GROUP_FIELDS = ['title', 'description', 'ageLimit', 'adminIds', 'channelIds', 'theme'];

// Limits and messages shared by the validation helpers below.
const USER_ROLES = ['super_admin', 'group_admin', 'user'];
const MAX_NAME_LENGTH = 50;
const MAX_GROUP_TITLE_LENGTH = 30;
const MAX_GROUP_DESCRIPTION_LENGTH = 250;
const MAX_CHANNEL_NAME_LENGTH = 30;
const PASSWORD_RULE_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter.';
const SYSTEM_BANNED_MESSAGE = 'This account has been banned from the system.';

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

// Returns a username in the one form it is stored and looked up
// in: no surrounding spaces, all lower case. Using this everywhere
// is what stops "Bob" being saved and then never matching at login.
function normaliseUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// True if an account already has this username. When a user is
// saving their own profile, excludeUserId is their id, so keeping
// their existing name isn't counted as a clash.
async function isUsernameTaken(username, excludeUserId) {
  const existing = await getDb().collection('users').findOne({ username });
  return existing !== null && existing._id.toString() !== excludeUserId;
}

// Checks a username for a new or updated account. Returns null if
// it can be used, or the HTTP status and message if it can't.
async function checkUsername(username, excludeUserId) {
  if (!username) {
    return { status: 400, message: 'A username is required.' };
  }
  if (await isUsernameTaken(username, excludeUserId)) {
    return { status: 409, message: 'That username is already taken.' };
  }
  return null;
}

// True for text that still has something in it once spaces are
// trimmed off. Used for every "this field is required" check.
function isFilledText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// The password rule: 8 or more characters with an uppercase letter.
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Z]/.test(password);
}

// A simple shape check for an email: something@something.something
// with no spaces. It can't prove the address exists.
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// True for a list in which every item is text (a list of ids).
function isListOfText(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

// Checks and tidies the details for a new account (register, the
// Admin Panel form and bootstrap all come through here). Returns
// { fields } ready to store, or { status, message } for the first
// problem found.
async function prepareNewUser(body) {
  const bad = message => ({ status: 400, message });
  const fields = pickFields(body, USER_CREATE_FIELDS);

  fields.username = normaliseUsername(fields.username);
  const usernameProblem = await checkUsername(fields.username);
  if (usernameProblem) {
    return usernameProblem;
  }

  for (const [name, label] of [['firstName', 'First name'], ['lastName', 'Last name']]) {
    if (!isFilledText(fields[name])) {
      return bad(`${label} is required.`);
    }
    fields[name] = fields[name].trim();
    if (fields[name].length > MAX_NAME_LENGTH) {
      return bad(`${label} must be ${MAX_NAME_LENGTH} characters or fewer.`);
    }
  }

  // The display name is what other users see. If none is given it
  // is made from the first and last name.
  fields.displayName = isFilledText(fields.displayName)
    ? fields.displayName.trim()
    : `${fields.firstName} ${fields.lastName}`;
  if (fields.displayName.length > MAX_NAME_LENGTH * 2 + 1) {
    return bad('Display name is too long.');
  }

  if (!isValidEmail(fields.email)) {
    return bad('Enter a valid email address.');
  }
  fields.email = fields.email.trim();

  if (!isValidPassword(fields.password)) {
    return bad(PASSWORD_RULE_MESSAGE);
  }

  // A date of birth is optional here (accounts made by an admin may
  // not have one), so it is only checked when one was sent. An
  // empty value counts as not sent and is not stored.
  if (!fields.dateOfBirth) {
    delete fields.dateOfBirth;
  } else if (calculateAge(fields.dateOfBirth) === null) {
    return bad(INVALID_DATE_OF_BIRTH_MESSAGE);
  }

  // Last step, once everything is known to be valid: the password
  // is replaced by its hash, so the plain text is never stored.
  fields.password = await hashPassword(fields.password);

  return { fields };
}

// Checks the changes to an existing account, tidying values in
// place. existing is the stored user. Returns null if every change
// is acceptable, or { status, message } for the first that isn't.
async function checkUserUpdates(updates, existing) {
  const bad = message => ({ status: 400, message });

  // A changed username is stored in the same lower-case form login
  // looks it up in, and must not belong to another account.
  if (updates.username !== undefined) {
    updates.username = normaliseUsername(updates.username);
    const usernameProblem = await checkUsername(updates.username, existing._id.toString());
    if (usernameProblem) {
      return usernameProblem;
    }
  }

  if (updates.displayName !== undefined) {
    if (!isFilledText(updates.displayName)) {
      return bad('Display name is required.');
    }
    updates.displayName = updates.displayName.trim();
    if (updates.displayName.length > MAX_NAME_LENGTH * 2 + 1) {
      return bad('Display name is too long.');
    }
  }

  if (updates.password !== undefined && !isValidPassword(updates.password)) {
    return bad(PASSWORD_RULE_MESSAGE);
  }

  if (updates.role !== undefined && !USER_ROLES.includes(updates.role)) {
    return bad('Role must be super_admin, group_admin or user.');
  }

  for (const listName of ['groupIds', 'bannedFromGroupIds']) {
    if (updates[listName] !== undefined && !isListOfText(updates[listName])) {
      return bad(`${listName} must be a list of group ids.`);
    }
  }

  // A Super Admin can't be banned from the system, so the people
  // who can undo a ban can never all be locked out.
  if (updates.isSystemBanned !== undefined) {
    if (typeof updates.isSystemBanned !== 'boolean') {
      return bad('isSystemBanned must be true or false.');
    }
    if (updates.isSystemBanned && existing.role === 'super_admin') {
      return bad('A Super Admin cannot be banned from the system.');
    }
  }

  // A date of birth can be set once. It is accepted only if the
  // new value is valid and the account doesn't already hold a
  // valid one, so a user can't change their age to get past a
  // group's age limit.
  if (updates.dateOfBirth !== undefined) {
    if (calculateAge(updates.dateOfBirth) === null) {
      return bad(INVALID_DATE_OF_BIRTH_MESSAGE);
    }
    if (calculateAge(existing.dateOfBirth) !== null) {
      return bad('Date of birth has already been set and cannot be changed.');
    }
  }

  // A profile picture must be a path this server handed out from
  // /api/upload, never an outside address.
  if (updates.profilePicUrl !== undefined && !isUploadedImageUrl(updates.profilePicUrl)) {
    return bad('A profile picture must be an image uploaded through the app.');
  }

  // Last step, once every change is known to be valid: a new
  // password is replaced by its hash before it is stored.
  if (updates.password !== undefined) {
    updates.password = await hashPassword(updates.password);
  }

  return null;
}

// Checks the fields of a group, tidying values in place. isNew is
// true when creating (a title is then required); when updating,
// only the fields that were sent are checked. Returns null if all
// is well, or the message for the first problem.
function checkGroupFields(fields, isNew) {
  if (isNew || fields.title !== undefined) {
    if (!isFilledText(fields.title)) {
      return 'A group title is required.';
    }
    fields.title = fields.title.trim();
    if (fields.title.length > MAX_GROUP_TITLE_LENGTH) {
      return `Group title must be ${MAX_GROUP_TITLE_LENGTH} characters or fewer.`;
    }
  }

  if (fields.description !== undefined) {
    if (typeof fields.description !== 'string') {
      return 'Group description must be text.';
    }
    fields.description = fields.description.trim();
    if (fields.description.length > MAX_GROUP_DESCRIPTION_LENGTH) {
      return `Group description must be ${MAX_GROUP_DESCRIPTION_LENGTH} characters or fewer.`;
    }
  }

  // The age limit must be a whole number. 0 means no limit. A form
  // may send it as text ("15"), so it is converted to a number.
  if (fields.ageLimit !== undefined) {
    const isNumberLike = typeof fields.ageLimit === 'number' ||
      (typeof fields.ageLimit === 'string' && fields.ageLimit.trim() !== '');
    const ageLimit = Number(fields.ageLimit);
    if (!isNumberLike || !Number.isInteger(ageLimit) || ageLimit < 0 || ageLimit > MAX_AGE_YEARS) {
      return `Age limit must be a whole number from 0 to ${MAX_AGE_YEARS} (0 means no limit).`;
    }
    fields.ageLimit = ageLimit;
  }

  for (const listName of ['adminIds', 'channelIds']) {
    if (fields[listName] !== undefined && !isListOfText(fields[listName])) {
      return `${listName} must be a list of ids.`;
    }
  }
  // An existing group can't have its last admin taken away.
  if (!isNew && fields.adminIds !== undefined && fields.adminIds.length === 0) {
    return 'A group must always have at least one admin.';
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

  // The first account goes through the same checks as any other
  // new account; only its role differs.
  const prepared = await prepareNewUser(req.body || {});
  if (prepared.message) {
    return res.status(prepared.status).json({ message: prepared.message });
  }

  const newSuperAdmin = {
    ...prepared.fields,
    role: 'super_admin',
    online: false,
    groupIds: [],
    bannedFromGroupIds: [],
    isSystemBanned: false
  };
  const result = await getDb().collection('users').insertOne(newSuperAdmin);
  res.status(201).json(toSafeUser({ ...newSuperAdmin, _id: result.insertedId }));
});

// --- Users ---

app.get('/api/users', async (req, res) => {
  const users = await getDb().collection('users').find().toArray();
  res.json(users.map(toSafeUser));
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = await getDb().collection('users').findOne({
    username: normaliseUsername(username)
  });

  // The typed password is hashed the same way and compared with
  // the stored hash; the server never holds the real password.
  if (!user || !(await passwordMatches(password, user.password))) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }
  // Checked only after the password, so the ban is not revealed to
  // someone who doesn't know the account's password.
  if (user.isSystemBanned) {
    return res.status(403).json({ message: SYSTEM_BANNED_MESSAGE });
  }

  res.json(toSafeUser(user));
});

app.post('/api/users', async (req, res) => {
  const prepared = await prepareNewUser(req.body || {});
  if (prepared.message) {
    return res.status(prepared.status).json({ message: prepared.message });
  }

  // Only the whitelisted fields are kept. Every new account starts
  // as a plain user in no groups, whatever the client sent.
  const newUser = {
    ...prepared.fields,
    role: 'user',
    online: false,
    groupIds: [],
    bannedFromGroupIds: [],
    isSystemBanned: false
  };
  const result = await getDb().collection('users').insertOne(newUser);
  res.status(201).json(toSafeUser({ ...newUser, _id: result.insertedId }));
});

// Deletes an account. Used by the Admin Panel's "remove" and by
// "delete my account" on the Profile page. A group must always
// keep at least one admin, so the only admin of a group can't be
// deleted until someone else is appointed.
app.delete('/api/users/:id', async (req, res) => {
  const users = getDb().collection('users');
  const user = ObjectId.isValid(req.params.id)
    ? await users.findOne({ _id: new ObjectId(req.params.id) })
    : null;
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  const userId = user._id.toString();
  const name = user.displayName || user.username;

  // Likewise the system must keep at least one Super Admin.
  if (user.role === 'super_admin' && (await users.countDocuments({ role: 'super_admin' })) <= 1) {
    return res.status(409).json({ message: 'The only Super Admin account cannot be deleted.' });
  }

  const adminOf = await getDb().collection('groups').find({ adminIds: userId }).toArray();
  const soleAdminOf = adminOf.filter(g => g.adminIds.length === 1);
  if (soleAdminOf.length > 0) {
    const titles = soleAdminOf.map(g => `"${g.title}"`).join(', ');
    return res.status(409).json({
      message: `${name} is the only admin of ${titles}. Appoint another admin for ${soleAdminOf.length === 1 ? 'that group' : 'each of those groups'} first.`
    });
  }

  // Tidy up what pointed at this account: their place in any
  // group's admin list, their unanswered join requests, and their
  // profile picture file. Messages they sent are left in place.
  await getDb().collection('groups').updateMany({ adminIds: userId }, { $pull: { adminIds: userId } });
  await getDb().collection('joinRequests').deleteMany({ userId, status: 'pending' });
  deleteUploadedImage(user.profilePicUrl);

  await users.deleteOne({ _id: user._id });
  res.status(204).send();
});

app.put('/api/users/:id', async (req, res) => {
  const updates = pickFields(req.body || {}, USER_UPDATE_FIELDS);
  // MongoDB rejects an empty $set, so answer clearly instead.
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update.' });
  }

  const existing = ObjectId.isValid(req.params.id)
    ? await getDb().collection('users').findOne({ _id: new ObjectId(req.params.id) })
    : null;
  if (!existing) {
    return res.status(404).json({ message: 'User not found.' });
  }

  // Every rule for changing an account is in checkUserUpdates. If
  // any change is refused, nothing in the request is saved.
  const problem = await checkUserUpdates(updates, existing);
  if (problem) {
    return res.status(problem.status).json({ message: problem.message });
  }

  await getDb().collection('users').updateOne({ _id: existing._id }, { $set: updates });

  // A replaced profile picture would never be shown again, so its
  // file is deleted once the new one is saved.
  if (updates.profilePicUrl && existing.profilePicUrl && existing.profilePicUrl !== updates.profilePicUrl) {
    deleteUploadedImage(existing.profilePicUrl);
  }
  res.status(204).send();
});

// --- Groups ---

app.get('/api/groups', async (req, res) => {
  const groups = await getDb().collection('groups').find().toArray();
  res.json(groups.map(toClientShape));
});

app.post('/api/groups', async (req, res) => {
  // Only the whitelisted fields are kept, with defaults for any
  // that were left out, and all of them are checked before saving.
  const fields = {
    description: '',
    ageLimit: 0,
    adminIds: [],
    channelIds: [],
    ...pickFields(req.body || {}, GROUP_FIELDS)
  };
  const problem = checkGroupFields(fields, true);
  if (problem) {
    return res.status(400).json({ message: problem });
  }

  // A group must have an admin from the moment it exists, and each
  // admin must be a real account. Without this a group could be
  // created that nobody is able to manage.
  if (fields.adminIds.length === 0) {
    return res.status(400).json({ message: 'A group needs at least one admin.' });
  }
  const users = getDb().collection('users');
  const admins = [];
  for (const adminId of fields.adminIds) {
    const admin = ObjectId.isValid(adminId) ? await users.findOne({ _id: new ObjectId(adminId) }) : null;
    if (!admin) {
      return res.status(400).json({ message: 'Every group admin must be an existing user.' });
    }
    admins.push(admin);
  }

  const result = await getDb().collection('groups').insertOne(fields);
  const newGroup = toClientShape({ ...fields, _id: result.insertedId });

  // Each admin becomes a member of the group, and a plain user is
  // promoted to Group Admin. Doing it here, not in the browser,
  // means the group and its admin's account can't disagree.
  for (const admin of admins) {
    const changes = { $addToSet: { groupIds: newGroup.id } };
    if (admin.role === 'user') {
      changes.$set = { role: 'group_admin' };
    }
    await users.updateOne({ _id: admin._id }, changes);
  }

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
  const updates = pickFields(req.body || {}, GROUP_FIELDS);
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update.' });
  }
  const group = ObjectId.isValid(req.params.id)
    ? await getDb().collection('groups').findOne({ _id: new ObjectId(req.params.id) })
    : null;
  if (!group) {
    return res.status(404).json({ message: 'Group not found.' });
  }

  // Only the fields that were sent are checked, with the same
  // rules as when a group is created.
  const problem = checkGroupFields(updates, false);
  if (problem) {
    return res.status(400).json({ message: problem });
  }

  await getDb().collection('groups').updateOne({ _id: group._id }, { $set: updates });
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
  const body = req.body || {};
  // A proposed group follows the same title and description rules
  // as a real one, so an approved request can't create a bad group.
  // The minimum age is optional on the form; left out, it is 0,
  // which means no limit.
  const proposed = {
    title: body.proposedTitle,
    description: body.proposedDescription,
    ageLimit: body.proposedAgeLimit === undefined ? 0 : body.proposedAgeLimit
  };
  const problem = checkGroupFields(proposed, true);
  if (problem) {
    return res.status(400).json({ message: problem });
  }
  if (!isFilledText(proposed.description)) {
    return res.status(400).json({ message: 'A group description is required.' });
  }
  const requester = typeof body.requestedBy === 'string' && ObjectId.isValid(body.requestedBy)
    ? await getDb().collection('users').findOne({ _id: new ObjectId(body.requestedBy) })
    : null;
  if (!requester) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const newRequest = {
    requestedBy: body.requestedBy,
    proposedTitle: proposed.title,
    proposedDescription: proposed.description,
    proposedAgeLimit: proposed.ageLimit,
    status: 'pending'
  };
  const result = await getDb().collection('groupRequests').insertOne(newRequest);
  res.status(201).json(toClientShape({ ...newRequest, _id: result.insertedId }));
});

app.put('/api/group-requests/:id', async (req, res) => {
  const { status, rejectionReason } = req.body || {};
  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ message: 'Status must be approved or rejected.' });
  }
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Group request not found.' });
  }
  const result = await getDb().collection('groupRequests').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status, rejectionReason } }
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ message: 'Group request not found.' });
  }
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
  const body = req.body || {};
  if (!isFilledText(body.name)) {
    return res.status(400).json({ message: 'A channel name is required.' });
  }
  const name = body.name.trim();
  if (name.length > MAX_CHANNEL_NAME_LENGTH) {
    return res.status(400).json({ message: `Channel name must be ${MAX_CHANNEL_NAME_LENGTH} characters or fewer.` });
  }
  // A channel has to belong to a group that exists.
  const group = typeof body.groupId === 'string' && ObjectId.isValid(body.groupId)
    ? await getDb().collection('groups').findOne({ _id: new ObjectId(body.groupId) })
    : null;
  if (!group) {
    return res.status(404).json({ message: 'Group not found.' });
  }

  const newChannel = { name, groupId: body.groupId };
  const result = await getDb().collection('channels').insertOne(newChannel);
  res.status(201).json(toClientShape({ ...newChannel, _id: result.insertedId }));
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

  // Each handler below reads its fields from "payload || {}", so a
  // client that sends nothing at all (null) is ignored instead of
  // crashing the server.
  socket.on('joinChannel', async (payload) => {
    const { channelId, userId, username } = payload || {};
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

  socket.on('leaveChannel', (payload) => {
    const { channelId } = payload || {};
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

  // Deletes one message. Only its sender may do this, and "sender"
  // means the user this socket joined as, not an id sent with the
  // request. Messages can be deleted but never edited. Nothing is
  // loaded to fill the gap, so a channel may then hold fewer than 5.
  socket.on('deleteMessage', async (payload) => {
    const { messageId } = payload || {};
    const userId = socket.data.userId;
    if (!userId || typeof messageId !== 'string' || !ObjectId.isValid(messageId)) {
      return;
    }
    const messages = getDb().collection('messages');
    const message = await messages.findOne({ _id: new ObjectId(messageId) });
    if (!message || message.senderId !== userId || !socket.rooms.has(message.channelId)) {
      return;
    }

    await messages.deleteOne({ _id: message._id });
    deleteUploadedImage(message.imageUrl);
    // Everyone with the channel open removes it from their screen.
    io.to(message.channelId).emit('messageDeleted', { id: messageId, channelId: message.channelId });
  });

 socket.on('sendMessage', async (payload) => {
  const message = payload || {};
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

connectToDatabase().then(async () => {
  // Accounts created before passwords were hashed are converted
  // here, once. On every later start there is nothing to convert.
  const conversion = await convertPlainTextPasswords(getDb());
  if (conversion.converted > 0) {
    console.log(`Hashed ${conversion.converted} plain-text password(s). Backup saved to ${conversion.backupPath}`);
  }

  httpServer.listen(PORT, () => {
    console.log(`Fabulari server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err.message);
});