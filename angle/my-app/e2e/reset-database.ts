import * as path from 'path';

// Empties the end-to-end test database, so a test file can start
// from the first-time setup screen whatever ran before it.
//
// It talks to MongoDB directly, using the driver installed for the
// server. The test server stays running; it simply finds no data.
// Only the "fabulari_e2e" database is touched.
export async function resetDatabase(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MongoClient } = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongodb'));
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  await client.db('fabulari_e2e').dropDatabase();
  await client.close();
}
