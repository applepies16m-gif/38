// Backend tests: accounts. Registration, login, password hashing,
// profile updates, system bans and account deletion.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, PASSWORD } = require('./helpers');

let server;
let superAdmin;

before(async () => {
  server = await startTestServer('users', 3101);
});

after(async () => {
  await server.stop();
});

const validPerson = (extra) => ({
  username: 'someone',
  password: PASSWORD,
  firstName: 'Some',
  lastName: 'One',
  email: 'someone@example.com',
  ...extra,
});

test('bootstrap creates the first Super Admin and then refuses to run again', async () => {
  const first = await server.api(
    'POST',
    '/bootstrap',
    validPerson({ username: 'Boss', role: 'user' }),
  );
  assert.equal(first.status, 201);
  assert.equal(first.body.role, 'super_admin');
  assert.equal(first.body.username, 'boss');
  superAdmin = first.body;

  const second = await server.api('POST', '/bootstrap', validPerson({ username: 'boss2' }));
  assert.equal(second.status, 403);
});

test('a new account is always a plain user in no groups, whatever the client sends', async () => {
  const response = await server.api(
    'POST',
    '/users',
    validPerson({
      username: 'sneaky',
      email: 'sneaky@example.com',
      role: 'super_admin',
      groupIds: ['x'],
      isSystemBanned: true,
      junk: 1,
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(response.body.role, 'user');
  assert.deepEqual(response.body.groupIds, []);
  assert.equal(response.body.isSystemBanned, false);
  assert.equal('junk' in response.body, false);
});

test('the password is stored as a bcrypt hash and never sent back', async () => {
  const created = await server.register('hashme');
  assert.equal('password' in created, false);

  const stored = await server.userInDb(created.id);
  assert.match(stored.password, /^\$2[aby]\$\d{2}\$.{53}$/);
  assert.notEqual(stored.password, PASSWORD);

  const everyone = await server.api('GET', '/users');
  assert.ok(everyone.body.length >= 2);
  assert.ok(everyone.body.every((user) => !('password' in user)));
});

test('login accepts the right password and refuses a wrong one', async () => {
  await server.register('loginuser');
  const good = await server.api('POST', '/login', { username: 'loginuser', password: PASSWORD });
  assert.equal(good.status, 200);
  assert.equal(good.body.username, 'loginuser');
  assert.equal('password' in good.body, false);

  const bad = await server.api('POST', '/login', { username: 'loginuser', password: 'Wrong12345' });
  assert.equal(bad.status, 401);
});

test('usernames are stored in lower case and must be unique whatever the capitals', async () => {
  const created = await server.register('MixedCase');
  assert.equal(created.username, 'mixedcase');

  for (const duplicate of ['mixedcase', 'MIXEDCASE', '  MixedCase ']) {
    const response = await server.api(
      'POST',
      '/users',
      validPerson({ username: duplicate, email: 'dup@example.com' }),
    );
    assert.equal(response.status, 409, `"${duplicate}" should be refused`);
  }
  const login = await server.api('POST', '/login', { username: ' MIXEDCASE ', password: PASSWORD });
  assert.equal(login.status, 200);
});

test('registration is refused with a clear message when a field is invalid', async () => {
  const cases = [
    ['no first name', { firstName: '' }],
    ['no last name', { lastName: '   ' }],
    ['email without @', { email: 'not-an-email' }],
    ['password too short', { password: 'Ab1' }],
    ['password with no uppercase letter', { password: 'lowercase123' }],
    ['date of birth in year 0112', { dateOfBirth: '0112-02-12' }],
    ['date of birth that does not exist', { dateOfBirth: '2023-02-29' }],
    ['no username', { username: '   ' }],
  ];
  for (const [label, change] of cases) {
    const response = await server.api(
      'POST',
      '/users',
      validPerson({ username: 'invalidcase', email: 'i@example.com', ...change }),
    );
    assert.equal(response.status, 400, label);
    assert.ok(response.body.message, label + ' should explain why');
  }
  const everyone = await server.api('GET', '/users');
  assert.equal(
    everyone.body.some((user) => user.username === 'invalidcase'),
    false,
  );
});

test('a date of birth is optional, but when given it must be real', async () => {
  const without = await server.api(
    'POST',
    '/users',
    validPerson({ username: 'nodob', email: 'nodob@example.com' }),
  );
  assert.equal(without.status, 201);
  assert.equal('dateOfBirth' in without.body, false);
});

test('saving a profile lower-cases the username and refuses one that is taken', async () => {
  const user = await server.register('profileuser');
  await server.register('takenname');

  const renamed = await server.api('PUT', '/users/' + user.id, {
    username: 'NewName',
    displayName: 'New Name',
  });
  assert.equal(renamed.status, 204);
  assert.equal((await server.userInDb(user.id)).username, 'newname');
  assert.equal(
    (await server.api('POST', '/login', { username: 'NewName', password: PASSWORD })).status,
    200,
  );

  const clash = await server.api('PUT', '/users/' + user.id, { username: 'TakenName' });
  assert.equal(clash.status, 409);
  assert.equal((await server.userInDb(user.id)).username, 'newname');
});

test('a changed password is hashed, works at login, and the old one stops working', async () => {
  const user = await server.register('pwchange');
  const weak = await server.api('PUT', '/users/' + user.id, { password: 'short' });
  assert.equal(weak.status, 400);

  const changed = await server.api('PUT', '/users/' + user.id, { password: 'Brandnew456' });
  assert.equal(changed.status, 204);
  assert.match((await server.userInDb(user.id)).password, /^\$2/);
  assert.equal(
    (await server.api('POST', '/login', { username: 'pwchange', password: 'Brandnew456' })).status,
    200,
  );
  assert.equal(
    (await server.api('POST', '/login', { username: 'pwchange', password: PASSWORD })).status,
    401,
  );
});

test('a date of birth can be set once and not changed afterwards', async () => {
  const user = (
    await server.api(
      'POST',
      '/users',
      validPerson({ username: 'setonce', email: 'setonce@example.com' }),
    )
  ).body;
  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { dateOfBirth: '2023-02-29' })).status,
    400,
  );
  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { dateOfBirth: '1999-04-04' })).status,
    204,
  );

  const second = await server.api('PUT', '/users/' + user.id, { dateOfBirth: '1980-01-01' });
  assert.equal(second.status, 400);
  assert.equal((await server.userInDb(user.id)).dateOfBirth, '1999-04-04');
});

test('an update with only unknown fields, or for an unknown user, is refused', async () => {
  const user = await server.register('fieldsuser');
  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { junk: 1, email: 'x@y.z' })).status,
    400,
  );
  assert.equal(
    (await server.api('PUT', '/users/000000000000000000000000', { displayName: 'X' })).status,
    404,
  );
  assert.equal((await server.api('PUT', '/users/not-an-id', { displayName: 'X' })).status, 404);
});

test('appearance settings must be whole numbers inside the slider ranges', async () => {
  const user = await server.register('looks');
  assert.equal(
    (
      await server.api('PUT', '/users/' + user.id, {
        appearance: { textScale: 120, hue: 300, extra: 1 },
      })
    ).status,
    204,
  );
  assert.deepEqual((await server.userInDb(user.id)).appearance, { textScale: 120, hue: 300 });
  for (const bad of [
    { textScale: 500, hue: 10 },
    { textScale: 100, hue: -5 },
    { textScale: '120', hue: 10 },
    'big',
    null,
  ]) {
    assert.equal((await server.api('PUT', '/users/' + user.id, { appearance: bad })).status, 400);
  }
});

test('the About Me text is saved trimmed, and refused when too long', async () => {
  const user = await server.register('aboutme');
  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { bio: '  I like chess.  ' })).status,
    204,
  );
  assert.equal((await server.userInDb(user.id)).bio, 'I like chess.');
  assert.equal(
    (await server.api('GET', '/users')).body.find((u) => u.id === user.id).bio,
    'I like chess.',
  );

  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { bio: 'x'.repeat(501) })).status,
    400,
  );
  assert.equal((await server.api('PUT', '/users/' + user.id, { bio: 42 })).status, 400);
  assert.equal((await server.userInDb(user.id)).bio, 'I like chess.');
});

test('a system ban is saved, blocks login with 403, and can be lifted', async () => {
  const user = await server.register('banme');
  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { isSystemBanned: true })).status,
    204,
  );

  const banned = await server.api('POST', '/login', { username: 'banme', password: PASSWORD });
  assert.equal(banned.status, 403);
  assert.match(banned.body.message, /banned/i);
  // A wrong password must not reveal that the account is banned.
  assert.equal(
    (await server.api('POST', '/login', { username: 'banme', password: 'Wrong12345' })).status,
    401,
  );

  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { isSystemBanned: false })).status,
    204,
  );
  assert.equal(
    (await server.api('POST', '/login', { username: 'banme', password: PASSWORD })).status,
    200,
  );
});

test('a Super Admin cannot be banned, and the only Super Admin cannot be deleted', async () => {
  assert.equal(
    (await server.api('PUT', '/users/' + superAdmin.id, { isSystemBanned: true })).status,
    400,
  );
  const response = await server.api('DELETE', '/users/' + superAdmin.id);
  assert.equal(response.status, 409);
  assert.ok(await server.userInDb(superAdmin.id));
});

test('the only admin of a group cannot be deleted until another admin is appointed', async () => {
  const soleAdmin = await server.register('soleadmin');
  const second = await server.register('secondadmin');
  const group = await server.createGroup('Sole Admin Group', [soleAdmin.id]);

  const refused = await server.api('DELETE', '/users/' + soleAdmin.id);
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /Sole Admin Group/);
  assert.ok(await server.userInDb(soleAdmin.id));

  await server.api('PUT', '/groups/' + group.id, { adminIds: [soleAdmin.id, second.id] });
  assert.equal((await server.api('DELETE', '/users/' + soleAdmin.id)).status, 204);
  assert.equal(await server.userInDb(soleAdmin.id), null);
  const groupNow = (await server.api('GET', '/groups')).body.find((g) => g.id === group.id);
  assert.deepEqual(groupNow.adminIds, [second.id]);
});

test('an ordinary user can be deleted, and their pending join requests go with them', async () => {
  const admin = await server.register('delgroupadmin');
  const leaver = await server.register('leaver');
  const group = await server.createGroup('Leaving Group', [admin.id]);
  assert.equal(
    (await server.api('POST', '/join-requests', { userId: leaver.id, groupId: group.id })).status,
    201,
  );

  assert.equal((await server.api('DELETE', '/users/' + leaver.id)).status, 204);
  assert.equal(await server.db.collection('joinRequests').countDocuments({ userId: leaver.id }), 0);
  assert.equal(
    (await server.api('POST', '/login', { username: 'leaver', password: PASSWORD })).status,
    401,
  );
});
