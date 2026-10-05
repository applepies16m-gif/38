// Backend tests: moderation. Blocking, reports, remove/ban
// requests (including the peer-admin rule), Super Admin
// notifications and the audit log.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, wait, PASSWORD } = require('./helpers');

let server;
let superAdmin, adminA, adminB, member1, member2, outsider, group;

before(async () => {
  server = await startTestServer('moderation', 3104);
  superAdmin = (
    await server.api('POST', '/bootstrap', {
      username: 'super',
      password: PASSWORD,
      firstName: 'Sam',
      lastName: 'Super',
      email: 'super@example.com',
    })
  ).body;
  adminA = await server.register('admina');
  adminB = await server.register('adminb');
  member1 = await server.register('member1');
  member2 = await server.register('member2');
  outsider = await server.register('outsider');
  group = await server.createGroup('Team', [adminA.id, adminB.id]);
  await server.addToGroup(member1.id, group.id);
  await server.addToGroup(member2.id, group.id);
});

after(async () => {
  await server.stop();
});

const auditTypes = async () =>
  (await server.api('GET', '/audit-log')).body.map((entry) => entry.type);

test("blocking is saved on the blocker's account and can be undone", async () => {
  assert.equal(
    (await server.api('POST', `/users/${member1.id}/blocks`, { blockedUserId: member2.id })).status,
    204,
  );
  assert.equal(
    (await server.api('POST', `/users/${member1.id}/blocks`, { blockedUserId: member2.id })).status,
    204,
  );
  assert.deepEqual((await server.userInDb(member1.id)).blockedUserIds, [member2.id]);
  assert.equal((await server.userInDb(member2.id)).blockedUserIds, undefined);

  assert.equal(
    (await server.api('POST', `/users/${member1.id}/blocks`, { blockedUserId: member1.id })).status,
    400,
  );
  assert.equal(
    (
      await server.api('POST', `/users/${member1.id}/blocks`, {
        blockedUserId: '000000000000000000000000',
      })
    ).status,
    404,
  );

  assert.equal(
    (await server.api('DELETE', `/users/${member1.id}/blocks/${member2.id}`)).status,
    204,
  );
  assert.deepEqual((await server.userInDb(member1.id)).blockedUserIds, []);
});

test('a report needs a reason and a reporter who belongs to the group', async () => {
  const good = {
    reporterId: member1.id,
    reportedUserId: member2.id,
    groupId: group.id,
    reason: ' Rude ',
    messageText: 'something rude',
  };
  const cases = [
    ['no reason', { reason: '  ' }, 400],
    ['reporting yourself', { reportedUserId: member1.id }, 400],
    ['reporter not in the group', { reporterId: outsider.id }, 403],
    ['unknown user', { reportedUserId: '000000000000000000000000' }, 404],
  ];
  for (const [label, change, status] of cases) {
    assert.equal(
      (await server.api('POST', '/reports', { ...good, ...change })).status,
      status,
      label,
    );
  }
  const created = await server.api('POST', '/reports', { ...good, status: 'resolved' });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'open');
  assert.equal(created.body.reason, 'Rude');
  assert.equal(created.body.messageText, 'something rude');
});

test("the Super Admin decides a report once; group admins can list their group's reports", async () => {
  const report = (await server.api('GET', '/reports?groupId=' + group.id)).body[0];
  assert.ok(report);
  assert.equal((await server.api('PUT', '/reports/' + report.id, { status: 'maybe' })).status, 400);
  assert.equal(
    (
      await server.api(
        'PUT',
        '/reports/' + report.id,
        { status: 'resolved', decisionNote: 'Warned' },
        superAdmin.id,
      )
    ).status,
    204,
  );
  assert.equal(
    (await server.api('PUT', '/reports/' + report.id, { status: 'dismissed' })).status,
    409,
  );

  const stored = (await server.api('GET', '/reports')).body.find((r) => r.id === report.id);
  assert.equal(stored.status, 'resolved');
  assert.equal(stored.decisionNote, 'Warned');
});

test('a member can ask for another member to be removed; approval removes without banning', async () => {
  const request = await server.api('POST', '/ban-requests', {
    requestedBy: member1.id,
    targetUserId: member2.id,
    groupId: group.id,
    action: 'remove',
    reason: 'Inactive',
  });
  assert.equal(request.status, 201);
  assert.equal(request.body.reviewer, 'group_admin');
  // A second pending request about the same person is refused.
  assert.equal(
    (
      await server.api('POST', '/ban-requests', {
        requestedBy: member1.id,
        targetUserId: member2.id,
        groupId: group.id,
        reason: 'Again',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await server.api('POST', '/ban-requests', {
        requestedBy: member1.id,
        targetUserId: member2.id,
        groupId: group.id,
        reason: '  ',
      })
    ).status,
    400,
  );

  assert.equal(
    (await server.api('PUT', '/ban-requests/' + request.body.id, { status: 'approved' }, adminA.id))
      .status,
    204,
  );
  const removed = await server.userInDb(member2.id);
  assert.equal(removed.groupIds.includes(group.id), false);
  assert.equal(removed.bannedFromGroupIds.includes(group.id), false);
  assert.equal(
    (await server.api('PUT', '/ban-requests/' + request.body.id, { status: 'rejected' })).status,
    409,
  );
});

test('approving a ban request removes the member and bans them from the group', async () => {
  await server.addToGroup(member2.id, group.id);
  const request = (
    await server.api('POST', '/ban-requests', {
      requestedBy: member1.id,
      targetUserId: member2.id,
      groupId: group.id,
      action: 'ban',
      reason: 'Spam',
    })
  ).body;
  assert.equal(
    (await server.api('PUT', '/ban-requests/' + request.id, { status: 'approved' }, adminA.id))
      .status,
    204,
  );
  const banned = await server.userInDb(member2.id);
  assert.equal(banned.groupIds.includes(group.id), false);
  assert.ok(banned.bannedFromGroupIds.includes(group.id));
});

test("a Group Admin cannot be banned directly, or at an ordinary member's request", async () => {
  const direct = await server.api('PUT', '/users/' + adminA.id, {
    groupIds: [],
    bannedFromGroupIds: [group.id],
  });
  assert.equal(direct.status, 403);
  assert.ok((await server.userInDb(adminA.id)).groupIds.includes(group.id));

  const byMember = await server.api('POST', '/ban-requests', {
    requestedBy: member1.id,
    targetUserId: adminA.id,
    groupId: group.id,
    reason: 'I do not like them',
  });
  assert.equal(byMember.status, 403);
});

test("another admin of the group can ask, and the Super Admin's approval removes them as admin", async () => {
  const request = await server.api('POST', '/ban-requests', {
    requestedBy: adminB.id,
    targetUserId: adminA.id,
    groupId: group.id,
    action: 'ban',
    reason: 'Abuse of powers',
  });
  assert.equal(request.status, 201);
  assert.equal(request.body.reviewer, 'super_admin');

  assert.equal(
    (
      await server.api(
        'PUT',
        '/ban-requests/' + request.body.id,
        { status: 'approved' },
        superAdmin.id,
      )
    ).status,
    204,
  );
  const former = await server.userInDb(adminA.id);
  assert.equal(former.groupIds.includes(group.id), false);
  assert.ok(former.bannedFromGroupIds.includes(group.id));
  assert.equal(former.role, 'user', 'no longer administers any group');

  const groupNow = (await server.api('GET', '/groups')).body.find((g) => g.id === group.id);
  assert.deepEqual(groupNow.adminIds, [adminB.id]);
});

test('only the Super Admin can send a notification, to everyone or to one user', async () => {
  assert.equal(
    (await server.api('POST', '/notifications', { sentBy: member1.id, message: 'hi' })).status,
    403,
  );
  assert.equal(
    (await server.api('POST', '/notifications', { sentBy: superAdmin.id, message: '   ' })).status,
    400,
  );
  assert.equal(
    (
      await server.api('POST', '/notifications', {
        sentBy: superAdmin.id,
        message: 'x'.repeat(501),
      })
    ).status,
    400,
  );

  const listener = server.connect();
  const other = server.connect();
  await wait(200);
  listener.emit('identify', { userId: member1.id });
  other.emit('identify', { userId: outsider.id });
  await wait(250);

  assert.equal(
    (
      await server.api(
        'POST',
        '/notifications',
        { sentBy: superAdmin.id, message: 'To everyone' },
        superAdmin.id,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await server.api(
        'POST',
        '/notifications',
        { sentBy: superAdmin.id, message: 'Just you', recipientId: member1.id },
        superAdmin.id,
      )
    ).status,
    201,
  );
  await wait(300);
  assert.equal(listener.count('notification'), 2);
  assert.equal(other.count('notification'), 1, 'the targeted one goes only to its recipient');
  listener.close();
  other.close();

  const mine = (await server.api('GET', '/notifications?userId=' + member1.id)).body;
  assert.deepEqual(
    mine.map((n) => n.message),
    ['Just you', 'To everyone'],
  );
  assert.equal((await server.api('GET', '/notifications?userId=' + outsider.id)).body.length, 1);

  assert.equal(
    (await server.api('POST', '/notifications/read', { userId: member1.id })).status,
    204,
  );
  assert.ok((await server.userInDb(member1.id)).notificationsReadAt);
});

test('admin actions are written to the audit log with who did them', async () => {
  const log = (await server.api('GET', '/audit-log')).body;
  const types = log.map((entry) => entry.type);
  for (const expected of [
    'group_created',
    'report_resolved',
    'ban_request_approved',
    'notification_sent',
  ]) {
    assert.ok(types.includes(expected), expected + ' should be logged');
  }
  const approval = log.find(
    (entry) => entry.type === 'ban_request_approved' && entry.actorRole === 'super_admin',
  );
  assert.ok(approval, "the Super Admin's approval is recorded against them");
  assert.equal(approval.actorName, 'Sam Super');
  assert.match(approval.summary, /Group Admin/);
});

test('things ordinary users do are not logged as admin actions', async () => {
  const before = (await auditTypes()).length;
  await server.register('justregistered');
  await server.api('PUT', '/users/' + member1.id, { displayName: 'Renamed' }, member1.id);
  await server.api(
    'POST',
    `/users/${member1.id}/blocks`,
    { blockedUserId: outsider.id },
    member1.id,
  );
  assert.equal((await auditTypes()).length, before);
});

test('the audit log can be filtered by action type and by date', async () => {
  const all = (await server.api('GET', '/audit-log')).body;
  assert.ok(all.length >= 4);
  // Newest first.
  assert.ok(all[0].createdAt >= all[all.length - 1].createdAt);

  const onlyGroups = (await server.api('GET', '/audit-log?type=group_created')).body;
  assert.ok(onlyGroups.length >= 1);
  assert.ok(onlyGroups.every((entry) => entry.type === 'group_created'));

  const day = (offset) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  assert.equal(
    (await server.api('GET', `/audit-log?from=${day(0)}&to=${day(0)}`)).body.length,
    all.length,
  );
  assert.equal((await server.api('GET', '/audit-log?from=' + day(1))).body.length, 0);
  assert.equal((await server.api('GET', '/audit-log?to=' + day(-1))).body.length, 0);
  assert.equal((await server.api('GET', '/audit-log?type=nonsense')).body.length, 0);
});
