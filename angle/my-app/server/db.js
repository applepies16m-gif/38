const { MongoClient } = require('mongodb');

// The automated tests set DB_NAME so they use a database of their
// own. Normal use needs neither variable.
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'fabulari';

let db = null;

// Connects once, on server startup, and reuses the same connection
// for every request afterward -- opening a new connection per
// request would be slow and wasteful.
async function connectToDatabase() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  db = client.db(DB_NAME);
  console.log(`Connected to MongoDB database "${DB_NAME}"`);
  return db;
}

// Returns the open database connection. Every route calls this
// instead of connecting again.
function getDb() {
  if (!db) {
    throw new Error('Database not connected yet -- call connectToDatabase() first.');
  }
  return db;
}

module.exports = { connectToDatabase, getDb };
