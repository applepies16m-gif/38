const express = require('express');
const cors = require('cors');
const { ObjectId } = require('mongodb');
const { connectToDatabase, getDb } = require('./db');

const app = express();
const PORT = 3000;

// Lets requests from the Angular dev server (localhost:4200) through.
app.use(cors());
// Parses incoming JSON request bodies into req.body automatically.
app.use(express.json());

// Strips MongoDB's real _id off a document and replaces it with a
// plain string `id`, matching what the Angular models expect.
function toClientShape(doc) {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id.toString() };
}

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

// --- Groups ---

app.get('/api/groups', async (req, res) => {
  const groups = await getDb().collection('groups').find().toArray();
  res.json(groups.map(toClientShape));
});

app.post('/api/groups', async (req, res) => {
  const result = await getDb().collection('groups').insertOne(req.body);
  res.status(201).json(toClientShape({ ...req.body, _id: result.insertedId }));
});

connectToDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Fabulari server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err.message);
});