// Backend tests: groups, join requests (including the age limit),
// group requests and channels.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

let server;
let admin;

// A date of birth this many years before today (plus some days).
function bornYearsAgo(years, plusDays = 0) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() + plusDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

before(async () => {
  server = await startTestServer('groups', 3102);
  admin = await server.register('groupsadmin');
});

after(async () => {
  await server.stop();
});

test('a group must be created with at least one admin who is a real user', async () => {
  assert.equal((await server.api('POST', '/groups', { title: 'No Admin' })).status, 400);
  assert.equal((await server.api('POST', '/groups', { title: 'Empty', adminIds: [] })).status, 400);
  assert.equal(
    (
      await server.api('POST', '/groups', {
        title: 'Ghost',
        adminIds: ['000000000000000000000000'],
      })
    ).status,
    400,
  );
  assert.equal((await server.api('GET', '/groups')).body.length, 0);
});

test('creating a group makes its admin a member and a Group Admin, and adds a general channel', async () => {
  const plain = await server.register('becomesadmin');
  assert.equal(plain.role, 'user');
  const group = await server.createGroup('Fresh Group', [plain.id]);

  const stored = await server.userInDb(plain.id);
  assert.equal(stored.role, 'group_admin');
  assert.ok(stored.groupIds.includes(group.id));

  const channels = (await server.api('GET', '/channels?groupId=' + group.id)).body;
  assert.equal(channels.length, 1);
  assert.equal(channels[0].name, 'general');
});

test('group fields are validated: title, description, age limit and colour', async () => {
  const cases = [
    ['title missing', { title: '   ' }],
    ['title of 31 characters', { title: 'x'.repeat(31) }],
    ['description of 251 characters', { title: 'T', description: 'x'.repeat(251) }],
    ['age limit that is not a number', { title: 'T', ageLimit: 'old' }],
    ['negative age limit', { title: 'T', ageLimit: -1 }],
    ['age limit with a fraction', { title: 'T', ageLimit: 15.5 }],
    ['colour that is not #rrggbb', { title: 'T', theme: 'red' }],
  ];
  for (const [label, fields] of cases) {
    const response = await server.api('POST', '/groups', { adminIds: [admin.id], ...fields });
    assert.equal(response.status, 400, label);
  }
  const ok = await server.createGroup('x'.repeat(30), [admin.id], {
    description: 'y'.repeat(250),
    ageLimit: '15',
    theme: '#a1c4fd',
  });
  assert.equal(ok.ageLimit, 15);
  assert.equal(ok.theme, '#a1c4fd');
});

test('group settings can be updated, but the last admin cannot be removed', async () => {
  const group = await server.createGroup('Settings Group', [admin.id]);
  assert.equal(
    (await server.api('PUT', '/groups/' + group.id, { ageLimit: 18, description: 'Adults' }))
      .status,
    204,
  );
  assert.equal(
    (await server.api('PUT', '/groups/' + group.id, { title: 'x'.repeat(31) })).status,
    400,
  );
  assert.equal((await server.api('PUT', '/groups/' + group.id, { adminIds: [] })).status, 400);
  assert.equal(
    (await server.api('PUT', '/groups/000000000000000000000000', { title: 'T' })).status,
    404,
  );

  const stored = (await server.api('GET', '/groups')).body.find((g) => g.id === group.id);
  assert.equal(stored.ageLimit, 18);
  assert.equal(stored.adminIds.length, 1);
});

test('a join request is refused for a banned user, an existing member or a duplicate', async () => {
  const group = await server.createGroup('Join Rules', [admin.id]);
  const applicant = await server.register('applicant');
  const banned = await server.register('bannedapplicant');
  await server.db
    .collection('users')
    .updateOne({ username: 'bannedapplicant' }, { $set: { bannedFromGroupIds: [group.id] } });

  assert.equal(
    (await server.api('POST', '/join-requests', { userId: banned.id, groupId: group.id })).status,
    403,
  );
  assert.equal(
    (await server.api('POST', '/join-requests', { userId: admin.id, groupId: group.id })).status,
    409,
  );
  assert.equal(
    (await server.api('POST', '/join-requests', { userId: applicant.id, groupId: group.id }))
      .status,
    201,
  );
  assert.equal(
    (await server.api('POST', '/join-requests', { userId: applicant.id, groupId: group.id }))
      .status,
    409,
  );
  assert.equal(
    (await server.api('POST', '/join-requests', { userId: 'nobody', groupId: group.id })).status,
    404,
  );
});

test('the age limit is enforced from the date of birth, to the day', async () => {
  const adults = await server.createGroup('Adults Only', [admin.id], { ageLimit: 18 });
  const child = await server.register('child', { dateOfBirth: bornYearsAgo(10) });
  const eighteenToday = await server.register('eighteentoday', { dateOfBirth: bornYearsAgo(18) });
  const eighteenTomorrow = await server.register('eighteentomorrow', {
    dateOfBirth: bornYearsAgo(18, 1),
  });
  const noBirthday = await server.register('nobirthday', { dateOfBirth: undefined });

  const tooYoung = await server.api('POST', '/join-requests', {
    userId: child.id,
    groupId: adults.id,
  });
  assert.equal(tooYoung.status, 403);
  assert.match(tooYoung.body.message, /18\+/);
  assert.equal(
    (
      await server.api('POST', '/join-requests', {
        userId: eighteenTomorrow.id,
        groupId: adults.id,
      })
    ).status,
    403,
  );
  assert.equal(
    (await server.api('POST', '/join-requests', { userId: eighteenToday.id, groupId: adults.id }))
      .status,
    201,
  );
  assert.equal(
    (await server.api('POST', '/join-requests', { userId: noBirthday.id, groupId: adults.id }))
      .status,
    403,
  );
});

test('approving a join request adds the user to the group', async () => {
  const group = await server.createGroup('Approve Me', [admin.id]);
  const joiner = await server.register('joiner');
  const request = (
    await server.api('POST', '/join-requests', { userId: joiner.id, groupId: group.id })
  ).body;

  assert.equal(
    (await server.api('PUT', '/join-requests/' + request.id, { status: 'approved' })).status,
    204,
  );
  assert.ok((await server.userInDb(joiner.id)).groupIds.includes(group.id));
});

test('approval re-checks the rules: a user banned while waiting is rejected with the reason', async () => {
  const group = await server.createGroup('Recheck', [admin.id]);
  const waiting = await server.register('waiting');
  const request = (
    await server.api('POST', '/join-requests', { userId: waiting.id, groupId: group.id })
  ).body;
  await server.db
    .collection('users')
    .updateOne({ username: 'waiting' }, { $set: { bannedFromGroupIds: [group.id] } });

  const response = await server.api('PUT', '/join-requests/' + request.id, { status: 'approved' });
  assert.equal(response.status, 409);
  assert.ok(response.body.message);

  const stored = (await server.api('GET', '/join-requests')).body.find((r) => r.id === request.id);
  assert.equal(stored.status, 'rejected');
  assert.equal(stored.rejectionReason, response.body.message);
  assert.equal((await server.userInDb(waiting.id)).groupIds.includes(group.id), false);
});

test('a group request carries a minimum age, which must be a whole number', async () => {
  const requester = await server.register('grouprequester');
  for (const badAge of ['abc', -1, 15.5, 121]) {
    const response = await server.api('POST', '/group-requests', {
      requestedBy: requester.id,
      proposedTitle: 'group1',
      proposedDescription: 'test',
      proposedAgeLimit: badAge,
    });
    assert.equal(response.status, 400, 'age ' + badAge);
  }
  const good = await server.api('POST', '/group-requests', {
    requestedBy: requester.id,
    proposedTitle: 'group1',
    proposedDescription: 'test',
    proposedAgeLimit: '15',
  });
  assert.equal(good.status, 201);
  assert.equal(good.body.proposedAgeLimit, 15);
  assert.equal(good.body.status, 'pending');

  assert.equal(
    (await server.api('POST', '/group-requests', { requestedBy: requester.id, proposedTitle: 'x' }))
      .status,
    400,
  );
  assert.equal(
    (await server.api('PUT', '/group-requests/' + good.body.id, { status: 'maybe' })).status,
    400,
  );
  assert.equal(
    (await server.api('PUT', '/group-requests/' + good.body.id, { status: 'approved' })).status,
    204,
  );
});

test('a channel needs a name and a real group', async () => {
  const group = await server.createGroup('Channel Rules', [admin.id]);
  assert.equal(
    (await server.api('POST', '/channels', { name: '  ', groupId: group.id })).status,
    400,
  );
  assert.equal(
    (await server.api('POST', '/channels', { name: 'x'.repeat(31), groupId: group.id })).status,
    400,
  );
  assert.equal(
    (await server.api('POST', '/channels', { name: 'chat', groupId: '000000000000000000000000' }))
      .status,
    404,
  );

  const created = await server.api('POST', '/channels', {
    name: '  exam-prep ',
    groupId: group.id,
    junk: 1,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'exam-prep');
  assert.equal('junk' in created.body, false);
});

test('deleting a channel removes its messages, but a group keeps its last channel', async () => {
  const group = await server.createGroup('Delete Channels', [admin.id]);
  const general = await server.firstChannelId(group.id);
  assert.equal((await server.api('DELETE', '/channels/' + general)).status, 409);

  const extra = (await server.api('POST', '/channels', { name: 'extra', groupId: group.id })).body;
  await server.db.collection('messages').insertMany([
    { channelId: extra.id, text: 'one' },
    { channelId: extra.id, text: 'two' },
    { channelId: general, text: 'keep me' },
  ]);

  assert.equal((await server.api('DELETE', '/channels/' + extra.id)).status, 204);
  assert.equal(await server.db.collection('messages').countDocuments({ channelId: extra.id }), 0);
  assert.equal(await server.db.collection('messages').countDocuments({ channelId: general }), 1);
  assert.equal((await server.api('DELETE', '/channels/' + extra.id)).status, 404);
});

test('a member can ask for a channel in a group they belong to, and only there', async () => {
  const groupA = await server.createGroup('Requests A', [admin.id]);
  const groupB = await server.createGroup('Requests B', [admin.id]);
  const member = await server.register('channelasker');
  await server.addToGroup(member.id, groupA.id);
  const ask = (groupId, roomName, requestedBy = member.id) =>
    server.api('POST', '/room-requests', { requestedBy, groupId, roomName });

  const created = await ask(groupA.id, '  homework-help ');
  assert.equal(created.status, 201);
  assert.equal(created.body.groupId, groupA.id, 'the request is tied to the group that was named');
  assert.equal(created.body.roomName, 'homework-help');
  assert.equal(created.body.status, 'pending');

  // The member belongs to group A only, so a request for group B is refused.
  assert.equal((await ask(groupB.id, 'homework-help')).status, 403);

  assert.equal((await ask(groupA.id, '   ')).status, 400);
  assert.equal((await ask(groupA.id, 'x'.repeat(31))).status, 400);
  assert.equal((await ask(groupA.id, 'general')).status, 409, 'the group already has that channel');
  assert.equal(
    (await ask(groupA.id, 'homework-help')).status,
    409,
    'already requested and waiting',
  );
  assert.equal((await ask('000000000000000000000000', 'x')).status, 404);
  assert.equal((await ask(groupA.id, 'x', 'nobody')).status, 404);
});

test('approving a channel request creates the channel in the requested group; rejecting does not', async () => {
  const groupA = await server.createGroup('Decide A', [admin.id]);
  const groupB = await server.createGroup('Decide B', [admin.id]);
  const member = await server.register('channelwaiter');
  await server.addToGroup(member.id, groupA.id);
  const channelNames = async (groupId) =>
    (await server.api('GET', '/channels?groupId=' + groupId)).body.map((c) => c.name).sort();

  const wanted = (
    await server.api('POST', '/room-requests', {
      requestedBy: member.id,
      groupId: groupA.id,
      roomName: 'projects',
    })
  ).body;
  const unwanted = (
    await server.api('POST', '/room-requests', {
      requestedBy: member.id,
      groupId: groupA.id,
      roomName: 'memes',
    })
  ).body;

  assert.equal(
    (await server.api('PUT', '/room-requests/' + wanted.id, { status: 'maybe' })).status,
    400,
  );
  assert.equal(
    (await server.api('PUT', '/room-requests/' + wanted.id, { status: 'approved' }, admin.id))
      .status,
    204,
  );
  assert.deepEqual(await channelNames(groupA.id), ['general', 'projects']);
  assert.deepEqual(await channelNames(groupB.id), ['general'], 'the other group is untouched');
  assert.equal(
    (await server.api('PUT', '/room-requests/' + wanted.id, { status: 'rejected' })).status,
    409,
  );

  assert.equal(
    (
      await server.api(
        'PUT',
        '/room-requests/' + unwanted.id,
        { status: 'rejected', rejectionReason: 'Off topic' },
        admin.id,
      )
    ).status,
    204,
  );
  assert.deepEqual(await channelNames(groupA.id), ['general', 'projects']);
  const stored = (await server.api('GET', '/room-requests')).body.find((r) => r.id === unwanted.id);
  assert.equal(stored.status, 'rejected');
  assert.equal(stored.rejectionReason, 'Off topic');

  const log = (await server.api('GET', '/audit-log')).body.map((entry) => entry.type);
  assert.ok(log.includes('room_request_approved'));
  assert.ok(log.includes('room_request_rejected'));
  assert.equal(
    (await server.api('PUT', '/room-requests/not-an-id', { status: 'approved' })).status,
    404,
  );
});

test('a channel request is refused at approval if the group has gained that channel meanwhile', async () => {
  const group = await server.createGroup('Race', [admin.id]);
  const member = await server.register('channelracer');
  await server.addToGroup(member.id, group.id);
  const request = (
    await server.api('POST', '/room-requests', {
      requestedBy: member.id,
      groupId: group.id,
      roomName: 'news',
    })
  ).body;
  // An admin adds the same channel directly before deciding the request.
  assert.equal(
    (await server.api('POST', '/channels', { name: 'news', groupId: group.id })).status,
    201,
  );

  const response = await server.api('PUT', '/room-requests/' + request.id, { status: 'approved' });
  assert.equal(response.status, 409);
  const channels = (await server.api('GET', '/channels?groupId=' + group.id)).body.filter(
    (c) => c.name === 'news',
  );
  assert.equal(channels.length, 1, 'no duplicate channel was created');
  assert.equal(
    (await server.api('GET', '/room-requests')).body.find((r) => r.id === request.id).status,
    'rejected',
  );
});
