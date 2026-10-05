// Resets the database to a small, known demo dataset.
//
//   node seed.js --yes                      (random password, printed once)
//   node seed.js --yes --password=Example1  (your own password for every demo account)
//   node seed.js --yes --large              (also adds 150 users, 40 groups and 120 audit
//                                            entries, to try out search and paging)
//
// It DELETES every user, group, channel, message and request, so
// it will not run without --yes, and it writes a backup to
// server/backups first. No password is written in this file: the
// one you give (or the random one) is hashed before it is stored.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connectToDatabase } = require('./db');
const { hashPassword, backupCollections } = require('./passwords');

// Every collection the app uses. All of them are emptied.
const COLLECTIONS = ['users', 'groups', 'channels', 'messages', 'joinRequests', 'groupRequests', 'roomRequests', 'banRequests', 'reports', 'notifications', 'auditLog'];

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

// The demo accounts. "key" is only used below to link groups to
// their admins and members.
const DEMO_USERS = [
  { key: 'super', username: 'super', firstName: 'Sam', lastName: 'Super', email: 'super@example.com', dateOfBirth: '1985-01-15', role: 'super_admin' },
  { key: 'groupadmin', username: 'groupadmin', firstName: 'Grace', lastName: 'Admin', email: 'groupadmin@example.com', dateOfBirth: '1990-06-20', role: 'group_admin' },
  { key: 'groupadmin2', username: 'groupadmin2', firstName: 'Gary', lastName: 'Admin', email: 'groupadmin2@example.com', dateOfBirth: '1992-09-05', role: 'group_admin' },
  { key: 'member', username: 'member', firstName: 'Mia', lastName: 'Member', email: 'member@example.com', dateOfBirth: '2000-03-10', role: 'user' },
  { key: 'newuser', username: 'newuser', firstName: 'Nick', lastName: 'Newman', email: 'newuser@example.com', dateOfBirth: '2001-11-30', role: 'user' }
];

// The demo groups. Each has an admin, members and channels.
const DEMO_GROUPS = [
  { title: 'Study Group', description: 'Help with coursework and exam prep.', ageLimit: 0, admins: ['groupadmin'], members: ['groupadmin', 'member'], channels: ['general', 'exam-prep'] },
  { title: 'Gaming Lounge', description: 'Talk about games. Adults only.', ageLimit: 18, admins: ['groupadmin2'], members: ['groupadmin2'], channels: ['general'] }
];

// Reads --name or --name=value from the command line. Returns the
// value, true for a bare flag, or undefined if it isn't there.
function readOption(name) {
  for (const arg of process.argv.slice(2)) {
    if (arg === `--${name}`) {
      return true;
    }
    if (arg.startsWith(`--${name}=`)) {
      return arg.slice(name.length + 3);
    }
  }
  return undefined;
}

// The same password rule the server applies.
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Z]/.test(password);
}

// Deletes uploaded images, since the messages and users they
// belonged to are gone. Only files named the way the upload
// endpoint names them are removed.
function clearUploads() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    return 0;
  }
  const files = fs.readdirSync(UPLOAD_DIR).filter(name => /^[a-f0-9]{32}\.(jpg|png|gif)$/.test(name));
  for (const name of files) {
    fs.unlinkSync(path.join(UPLOAD_DIR, name));
  }
  return files.length;
}

async function seed() {
  if (readOption('yes') !== true) {
    console.log('This deletes ALL users, groups, channels, messages and requests.');
    console.log('Run it again with --yes to go ahead:  node seed.js --yes');
    process.exit(1);
  }

  // Use the password given, or make a random one that passes the
  // rule ("Demo" supplies the uppercase letter).
  const given = readOption('password') || process.env.SEED_PASSWORD;
  if (given !== undefined && !isValidPassword(given)) {
    console.log('The password must be at least 8 characters and include an uppercase letter.');
    process.exit(1);
  }
  const password = given || 'Demo' + crypto.randomBytes(5).toString('hex');

  const db = await connectToDatabase();

  const backupPath = await backupCollections(db, 'before-seed');
  console.log(`Backup of the current data saved to ${backupPath}`);

  for (const name of COLLECTIONS) {
    await db.collection(name).deleteMany({});
  }
  const removedImages = clearUploads();

  // Users first, so their new ids are known when the groups are made.
  const passwordHash = await hashPassword(password);
  const userIds = {};
  for (const demoUser of DEMO_USERS) {
    const { key, ...details } = demoUser;
    const result = await db.collection('users').insertOne({
      ...details,
      displayName: `${details.firstName} ${details.lastName}`,
      password: passwordHash,
      online: false,
      groupIds: [],
      bannedFromGroupIds: [],
      isSystemBanned: false
    });
    userIds[key] = result.insertedId;
  }

  for (const demoGroup of DEMO_GROUPS) {
    const result = await db.collection('groups').insertOne({
      title: demoGroup.title,
      description: demoGroup.description,
      ageLimit: demoGroup.ageLimit,
      adminIds: demoGroup.admins.map(key => userIds[key].toString()),
      channelIds: []
    });
    const groupId = result.insertedId.toString();

    for (const channelName of demoGroup.channels) {
      await db.collection('channels').insertOne({ name: channelName, groupId });
    }
    for (const key of demoGroup.members) {
      await db.collection('users').updateOne({ _id: userIds[key] }, { $addToSet: { groupIds: groupId } });
    }
  }

  // --large adds a lot of extra data, to show that the searchable,
  // paged lists (users, groups, audit log) cope with long lists.
  let extra = '';
  if (readOption('large') === true) {
    const adminId = userIds['groupadmin'].toString();
    const manyUsers = [];
    for (let n = 1; n <= 150; n++) {
      const number = String(n).padStart(3, '0');
      manyUsers.push({
        username: `user${number}`, firstName: 'Test', lastName: `User ${number}`, displayName: `Test User ${number}`,
        email: `user${number}@example.com`, dateOfBirth: '1999-01-01', role: 'user', password: passwordHash,
        online: false, groupIds: [], bannedFromGroupIds: [], isSystemBanned: false
      });
    }
    await db.collection('users').insertMany(manyUsers);

    for (let n = 1; n <= 40; n++) {
      const result = await db.collection('groups').insertOne({
        title: `Club ${String(n).padStart(2, '0')}`, description: `Sample group number ${n} for testing long lists.`,
        ageLimit: n % 5 === 0 ? 18 : 0, adminIds: [adminId], channelIds: []
      });
      const groupId = result.insertedId.toString();
      await db.collection('channels').insertOne({ name: 'general', groupId });
      await db.collection('users').updateOne({ _id: userIds['groupadmin'] }, { $addToSet: { groupIds: groupId } });
    }

    const manyEntries = [];
    // Oldest first, the order real entries are written in.
    for (let n = 120; n >= 1; n--) {
      manyEntries.push({
        type: ['group_updated', 'join_request_approved', 'member_banned', 'channel_created'][n % 4],
        summary: `Sample audit entry number ${n}`, actorId: adminId, actorName: 'Grace Admin', actorRole: 'group_admin',
        createdAt: new Date(Date.now() - n * 3600 * 1000).toISOString()
      });
    }
    await db.collection('auditLog').insertMany(manyEntries);
    extra = ' Large data set added: 150 more users (user001 to user150), 40 more groups and 120 audit entries.';
  }

  console.log(`Removed ${removedImages} uploaded image file(s).${extra}`);
  console.log(`Created ${DEMO_USERS.length} users and ${DEMO_GROUPS.length} groups:`);
  for (const demoUser of DEMO_USERS) {
    console.log(`  ${demoUser.username.padEnd(12)} ${demoUser.role}`);
  }
  console.log(given
    ? 'Every account uses the password you supplied.'
    : `Every account uses this password (it is not saved anywhere else): ${password}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
