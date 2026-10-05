// Everything to do with storing passwords safely: hashing a new
// password, checking one at login, and the one-off conversion of
// accounts that were created before hashing existed.
//
// A hash is a one-way scramble. The server stores the hash, never
// the password, so someone who reads the database cannot log in
// with what they find. bcrypt also mixes in a random "salt", so two
// users with the same password get different hashes.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { BSON } = require('mongodb');

// How much work each hash takes. 10 is the usual default: slow
// enough to make guessing expensive, quick enough for a login.
const HASH_ROUNDS = 10;

// Backups are written here. The folder is in .gitignore.
const BACKUP_DIR = path.join(__dirname, 'backups');

// The collections saved by a backup.
const BACKUP_COLLECTIONS = ['users', 'groups', 'joinRequests', 'groupRequests', 'roomRequests', 'banRequests'];

// Every bcrypt hash has this shape: $2a$ or $2b$, the rounds, then
// 53 characters. Anything else in the password field is plain text.
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// True if the stored value is already a bcrypt hash.
function isHashed(value) {
  return typeof value === 'string' && BCRYPT_PATTERN.test(value);
}

// Turns a password into the hash that gets stored.
function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, HASH_ROUNDS);
}

// True if the password typed at login matches the stored hash. A
// stored value that isn't a hash never matches.
async function passwordMatches(plainPassword, storedHash) {
  if (typeof plainPassword !== 'string' || !isHashed(storedHash)) {
    return false;
  }
  return bcrypt.compare(plainPassword, storedHash);
}

// Saves the users, groups and request collections to one JSON file
// in the backups folder and returns the file's path. The label
// becomes the start of the file name.
async function backupCollections(db, label) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) {
    collections[name] = await db.collection(name).find().toArray();
  }
  const takenAt = new Date().toISOString();
  const fileName = `${label}-${takenAt.replace(/[:.]/g, '-')}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  // EJSON keeps MongoDB's own types (such as ObjectId) intact, so
  // the file can be loaded back exactly as it was.
  fs.writeFileSync(filePath, BSON.EJSON.stringify({ takenAt, collections }, null, 2));
  return filePath;
}

// One-off conversion, run each time the server starts. Any account
// whose password is still plain text gets it replaced by a hash,
// so everyone keeps the password they already know. Accounts that
// are already hashed are not touched, so running it again changes
// nothing. A backup is written first, but only when there is
// something to convert. Returns how many were converted and where
// the backup went (null if none was needed).
async function convertPlainTextPasswords(db) {
  const users = db.collection('users');
  const all = await users.find({}, { projection: { password: 1 } }).toArray();
  const plain = all.filter(u => typeof u.password === 'string' && u.password !== '' && !isHashed(u.password));
  if (plain.length === 0) {
    return { converted: 0, backupPath: null };
  }

  const backupPath = await backupCollections(db, 'before-password-hashing');
  for (const user of plain) {
    await users.updateOne(
      { _id: user._id, password: user.password },
      { $set: { password: await hashPassword(user.password) } }
    );
  }
  return { converted: plain.length, backupPath };
}

module.exports = { isHashed, hashPassword, passwordMatches, backupCollections, convertPlainTextPasswords };
