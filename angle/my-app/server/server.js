const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Lets requests from the Angular dev server (localhost:4200) through.
app.use(cors());
// Parses incoming JSON request bodies into req.body automatically.
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const GROUPS_FILE = path.join(__dirname, 'data', 'groups.json');

// Small helper: reads a JSON file and parses it. If the file doesn't
// exist yet (first run), returns an empty array instead of crashing.
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

// Small helper: writes data back to a JSON file, pretty-printed so
// it's readable if you open it directly.
function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- Users ---

app.get('/api/users', (req, res) => {
  const users = readJsonFile(USERS_FILE);
  res.json(users);
});
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJsonFile(USERS_FILE);
  const user = users.find(u => u.username.toLowerCase() === (username || '').toLowerCase());

  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  // Never send the password back to the client.
  const { password: _pw, ...safeUser } = user;
  res.json(safeUser);
});
app.post('/api/users', (req, res) => {
  const users = readJsonFile(USERS_FILE);
  const newUser = {
    id: 'u' + (users.length + 1),
    ...req.body
  };
  users.push(newUser);
  writeJsonFile(USERS_FILE, users);
  res.status(201).json(newUser);
});

app.delete('/api/users/:id', (req, res) => {
  let users = readJsonFile(USERS_FILE);
  users = users.filter(u => u.id !== req.params.id);
  writeJsonFile(USERS_FILE, users);
  res.status(204).send();
});

// --- Groups ---

app.get('/api/groups', (req, res) => {
  const groups = readJsonFile(GROUPS_FILE);
  res.json(groups);
});

app.post('/api/groups', (req, res) => {
  const groups = readJsonFile(GROUPS_FILE);
  const newGroup = {
    id: 'g' + (groups.length + 1),
    ...req.body
  };
  groups.push(newGroup);
  writeJsonFile(GROUPS_FILE, groups);
  res.status(201).json(newGroup);
});

app.listen(PORT, () => {
  console.log(`griffchat server running on http://localhost:${PORT}`);
});