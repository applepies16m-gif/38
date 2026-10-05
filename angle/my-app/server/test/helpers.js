// Shared set-up for the backend tests.
//
// Each test file starts its own copy of the real server as a
// separate process, on its own port, with its own MongoDB database
// and its own folders for uploads and backups. The tests then talk
// to it over HTTP and sockets exactly as the Angular app does.
// When the file finishes, the server is stopped and the database
// and folders are deleted, so nothing is left behind and the real
// "fabulari" database is never touched.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const { io } = require('socket.io-client');

// A password that satisfies the rule (8+ characters, 1 uppercase).
const PASSWORD = 'Testing123';

// Pauses for a moment, to let a socket event arrive.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Starts a test server. name keeps this file's database separate
// from the other test files'; port must be different for each file,
// because the files run at the same time.
async function startTestServer(name, port) {
  const dbName = 'fabulari_test_' + name;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabulari-test-'));
  const uploadDir = path.join(tempDir, 'uploads');

  const mongo = new MongoClient('mongodb://localhost:27017');
  await mongo.connect();
  const db = mongo.db(dbName);
  await db.dropDatabase();

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      DB_NAME: dbName,
      UPLOAD_DIR: uploadDir,
      BACKUP_DIR: path.join(tempDir, 'backups'),
      CLIENT_ORIGIN: '*'
    }
  });

  // The server prints "running on" once it is ready for requests.
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Test server did not start in time:\n' + output)), 20000);
    const onData = data => {
      output += data;
      if (output.includes('running on')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => reject(new Error('Test server stopped early (code ' + code + '):\n' + output)));
  });

  const base = `http://localhost:${port}`;

  // Sends one request to the API. asUserId is sent as the
  // X-User-Id header, the way the Angular interceptor sends the
  // logged-in user's id. Returns the status and the parsed body.
  async function api(method, route, body, asUserId) {
    const headers = { 'Content-Type': 'application/json' };
    if (asUserId) {
      headers['X-User-Id'] = asUserId;
    }
    const response = await fetch(base + '/api' + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let parsed = null;
    try {
      parsed = await response.json();
    } catch (err) {
      // No JSON body (for example a 204).
    }
    return { status: response.status, body: parsed };
  }

  let counter = 0;
  // Registers a user through the API and returns the created user.
  // extra overrides any of the default fields.
  async function register(username, extra = {}) {
    counter++;
    const response = await api('POST', '/users', {
      username,
      password: PASSWORD,
      firstName: 'Test',
      lastName: username,
      email: `${username}${counter}@example.com`,
      dateOfBirth: '1995-05-05',
      ...extra
    });
    if (response.status !== 201) {
      throw new Error(`Could not register ${username}: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body;
  }

  // Creates a group through the API with the given admins.
  async function createGroup(title, adminIds, extra = {}) {
    const response = await api('POST', '/groups', { title, adminIds, ...extra });
    if (response.status !== 201) {
      throw new Error(`Could not create group ${title}: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body;
  }

  // Puts a user straight into a group, as an approved join would.
  async function addToGroup(userId, groupId) {
    await db.collection('users').updateOne({ _id: new ObjectId(userId) }, { $addToSet: { groupIds: groupId } });
  }

  // The id of a group's first channel ("general").
  async function firstChannelId(groupId) {
    return (await db.collection('channels').findOne({ groupId }))._id.toString();
  }

  // Reads a user straight from the database (including the
  // password hash, which the API never returns).
  function userInDb(userId) {
    return db.collection('users').findOne({ _id: new ObjectId(userId) });
  }

  // Opens a socket and records every event it receives, so a test
  // can ask afterwards what arrived.
  function connect() {
    const socket = io(base, { forceNew: true });
    const events = [];
    const names = ['newMessage', 'messageDeleted', 'userJoined', 'userLeft', 'channelDenied',
      'presenceChanged', 'membershipChanged', 'channelDeleted', 'notification'];
    for (const eventName of names) {
      socket.on(eventName, data => events.push({ event: eventName, ...(data || {}) }));
    }
    return {
      socket,
      events,
      emit: (eventName, data) => socket.emit(eventName, data),
      // How many events of this name arrived (optionally only those matching a test).
      count: (eventName, matches = () => true) => events.filter(e => e.event === eventName && matches(e)).length,
      close: () => socket.disconnect()
    };
  }

  // Stops the server and removes everything the tests created.
  async function stop() {
    child.kill();
    await db.dropDatabase();
    await mongo.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { base, api, db, register, createGroup, addToGroup, firstChannelId, userInDb, connect, stop, uploadDir };
}

module.exports = { startTestServer, wait, PASSWORD, ObjectId };
