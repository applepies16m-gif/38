// Starts the real server for the end-to-end tests, pointed at a
// database of its own ("fabulari_e2e") that is emptied first, on
// port 3100. The normal server (port 3000, database "fabulari") is
// not involved, so the tests can run while it is in use and never
// touch real data.
//
// Playwright runs this for you (see playwright.config.ts).

const fs = require('fs');
const os = require('os');
const path = require('path');
const serverDir = path.join(__dirname, '..', 'server');
const { MongoClient } = require(path.join(serverDir, 'node_modules', 'mongodb'));

const DB_NAME = 'fabulari_e2e';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabulari-e2e-'));

process.env.PORT = '3100';
process.env.DB_NAME = DB_NAME;
process.env.UPLOAD_DIR = path.join(tempDir, 'uploads');
process.env.BACKUP_DIR = path.join(tempDir, 'backups');
// The test copy of the Angular app is served from port 4300.
process.env.CLIENT_ORIGIN = 'http://localhost:4300';

(async () => {
  // Start from an empty database every time, so the tests always
  // begin at the first-time setup screen.
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  await client.db(DB_NAME).dropDatabase();
  await client.close();

  require(path.join(serverDir, 'server.js'));
})().catch((err) => {
  console.error('Could not start the end-to-end test server:', err.message);
  process.exit(1);
});
