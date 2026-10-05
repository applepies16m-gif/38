// Backend tests: real-time chat over sockets. Joining a channel,
// sending, the last-5 rule, deleting a message, who is online, and
// removing a banned user from an open channel.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, wait, ObjectId } = require('./helpers');

let server;
let admin, alice, bob, outsider;
let group, channelId;
const open = [];   // sockets to close at the end

// Opens a socket that has identified as a user and joined the channel.
async function joined(user) {
  const client = server.connect();
  open.push(client);
  await wait(150);
  client.emit('identify', { userId: user.id });
  client.emit('joinChannel', { channelId, userId: user.id, username: user.username });
  await wait(250);
  return client;
}

const message = (text, extra = {}) => ({ channelId, senderName: 'someone', text, timestamp: new Date().toISOString(), ...extra });
const storedMessages = () => server.db.collection('messages').countDocuments({ channelId });

before(async () => {
  server = await startTestServer('chat', 3103);
  admin = await server.register('chatadmin');
  alice = await server.register('alice');
  bob = await server.register('bob');
  outsider = await server.register('outsider');
  group = await server.createGroup('Chat Group', [admin.id]);
  await server.addToGroup(alice.id, group.id);
  await server.addToGroup(bob.id, group.id);
  channelId = await server.firstChannelId(group.id);
});

after(async () => {
  for (const client of open) {
    client.close();
  }
  await server.stop();
});

test('a user who is not a member is refused, and nobody is told they joined', async () => {
  const watcher = await joined(alice);
  const stranger = server.connect();
  open.push(stranger);
  await wait(150);
  stranger.emit('joinChannel', { channelId, userId: outsider.id, username: 'outsider' });
  await wait(250);

  assert.equal(stranger.count('channelDenied'), 1);
  assert.equal(watcher.count('userJoined', e => e.username === 'outsider'), 0);

  // Leaving or closing afterwards must not announce a departure either.
  stranger.emit('leaveChannel', { channelId });
  await wait(150);
  stranger.close();
  await wait(250);
  assert.equal(watcher.count('userLeft', e => e.username === 'outsider'), 0);
  watcher.close();
});

test('members exchange messages, and the sender id is the one the socket joined as', async () => {
  const a = await joined(alice);
  const b = await joined(bob);
  assert.equal(a.count('userJoined', e => e.userId === bob.id), 1);

  // Bob claims to be Alice inside the message; the server ignores that.
  b.emit('sendMessage', message('hello from bob', { senderId: alice.id }));
  await wait(300);

  const received = a.events.find(e => e.event === 'newMessage');
  assert.ok(received, 'alice should receive the message');
  assert.equal(received.text, 'hello from bob');
  assert.equal(received.senderId, bob.id);
  assert.equal(b.count('newMessage'), 1);
  a.close();
  b.close();
});

test('a socket that has not joined the channel cannot send into it', async () => {
  const before = await storedMessages();
  const loose = server.connect();
  open.push(loose);
  await wait(150);
  loose.emit('sendMessage', message('not in the room', { senderId: alice.id }));
  await wait(250);
  assert.equal(await storedMessages(), before);
  assert.equal(loose.count('channelDenied'), 1);
  loose.close();
});

test('only the last 5 messages of a channel are kept, and history returns them oldest first', async () => {
  const a = await joined(alice);
  for (let n = 1; n <= 7; n++) {
    a.emit('sendMessage', message('message ' + n));
    await wait(120);
  }
  await wait(300);
  assert.equal(await storedMessages(), 5);

  const history = await server.api('GET', `/messages?channelId=${channelId}&userId=${alice.id}`);
  assert.deepEqual(history.body.map(m => m.text), ['message 3', 'message 4', 'message 5', 'message 6', 'message 7']);

  // Someone who is not a member gets nothing, as does a request with no user id.
  assert.deepEqual((await server.api('GET', `/messages?channelId=${channelId}&userId=${outsider.id}`)).body, []);
  assert.deepEqual((await server.api('GET', `/messages?channelId=${channelId}`)).body, []);
  a.close();
});

test('an empty message is dropped', async () => {
  const a = await joined(alice);
  const before = await storedMessages();
  a.emit('sendMessage', message('   '));
  await wait(250);
  assert.equal(await storedMessages(), before);
  assert.equal(a.count('newMessage'), 0);
  a.close();
});

test('a user can delete their own message, live for everyone, but not someone else\'s', async () => {
  const a = await joined(alice);
  const b = await joined(bob);
  a.emit('sendMessage', message('delete me'));
  await wait(300);
  const sent = a.events.find(e => e.event === 'newMessage' && e.text === 'delete me');
  const before = await storedMessages();

  b.emit('deleteMessage', { messageId: sent.id });
  await wait(250);
  assert.equal(await storedMessages(), before, 'bob must not be able to delete alice\'s message');

  a.emit('deleteMessage', { messageId: sent.id });
  await wait(300);
  assert.equal(await storedMessages(), before - 1);
  assert.equal(a.count('messageDeleted', e => e.id === sent.id), 1);
  assert.equal(b.count('messageDeleted', e => e.id === sent.id), 1);

  // Nothing is loaded to fill the gap.
  const history = await server.api('GET', `/messages?channelId=${channelId}&userId=${bob.id}`);
  assert.equal(history.body.length, before - 1);
  a.close();
  b.close();
});

test('bad payloads on any socket event do not crash the server', async () => {
  const client = server.connect();
  open.push(client);
  await wait(150);
  for (const eventName of ['identify', 'joinChannel', 'leaveChannel', 'sendMessage', 'deleteMessage']) {
    client.emit(eventName, null);
    client.emit(eventName, 'text');
    client.emit(eventName, 42);
    client.emit(eventName);
  }
  await wait(400);
  assert.equal((await server.api('GET', '/users')).status, 200);
  client.close();
});

test('a user is online while at least one of their tabs is open', async () => {
  const watcher = server.connect();
  const tab1 = server.connect();
  const tab2 = server.connect();
  open.push(watcher, tab1, tab2);
  await wait(200);
  const isOnline = async () => (await server.api('GET', '/users')).body.find(u => u.id === outsider.id).online;

  assert.equal(await isOnline(), false);
  tab1.emit('identify', { userId: outsider.id });
  await wait(250);
  assert.equal(await isOnline(), true);
  tab2.emit('identify', { userId: outsider.id });
  await wait(250);
  assert.equal(watcher.count('presenceChanged', e => e.userId === outsider.id && e.online), 1, 'announced once, not per tab');

  tab1.close();
  await wait(300);
  assert.equal(await isOnline(), true, 'still online with one tab left');
  assert.equal(watcher.count('presenceChanged', e => e.userId === outsider.id && !e.online), 0);

  tab2.close();
  await wait(300);
  assert.equal(await isOnline(), false);
  assert.equal(watcher.count('presenceChanged', e => e.userId === outsider.id && !e.online), 1);
  watcher.close();
});

test('signing out marks the user offline even though the tab stays open', async () => {
  const tab = server.connect();
  open.push(tab);
  await wait(150);
  tab.emit('identify', { userId: outsider.id });
  await wait(250);
  tab.emit('signOut');
  await wait(250);
  assert.equal((await server.api('GET', '/users')).body.find(u => u.id === outsider.id).online, false);
  tab.close();
});

test('a member banned from the group is removed from the open channel straight away', async () => {
  const victim = await server.register('victim');
  await server.addToGroup(victim.id, group.id);
  const v = await joined(victim);
  const a = await joined(alice);

  const ban = await server.api('PUT', '/users/' + victim.id, { groupIds: [], bannedFromGroupIds: [group.id] });
  assert.equal(ban.status, 204);
  await wait(400);
  assert.equal(v.count('channelDenied'), 1, 'told at once, without sending anything');
  assert.ok(v.count('membershipChanged') >= 1);

  a.emit('sendMessage', message('after the ban'));
  await wait(300);
  assert.equal(v.count('newMessage'), 0, 'no longer receives the channel\'s messages');
  assert.equal(a.count('newMessage'), 1);

  // And they cannot rejoin.
  v.emit('joinChannel', { channelId, userId: victim.id, username: 'victim' });
  await wait(250);
  assert.equal(v.count('channelDenied'), 2);
  v.close();
  a.close();
});

test('closing a tab tells the channel the user left, exactly once', async () => {
  const a = await joined(alice);
  const b = await joined(bob);
  b.emit('leaveChannel', { channelId });
  await wait(250);
  b.close();
  await wait(300);
  assert.equal(a.count('userLeft', e => e.userId === bob.id), 1);
  a.close();
});

test('an unknown or malformed message id is ignored by delete', async () => {
  const a = await joined(alice);
  const before = await storedMessages();
  a.emit('deleteMessage', { messageId: new ObjectId().toString() });
  a.emit('deleteMessage', { messageId: 'not-an-id' });
  await wait(300);
  assert.equal(await storedMessages(), before);
  a.close();
});
