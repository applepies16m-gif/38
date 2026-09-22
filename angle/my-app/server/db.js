const { MongoClient } = require('mongodb');

const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME = 'fabulari';

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

function getDb() {
  if (!db) {
    throw new Error('Database not connected yet -- call connectToDatabase() first.');
  }
  return db;
}

module.exports = { connectToDatabase, getDb };