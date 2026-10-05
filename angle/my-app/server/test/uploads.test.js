// Backend tests: images. The upload endpoint, images in chat
// messages, and profile pictures.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startTestServer, wait } = require('./helpers');

let server;
let admin, group, channelId;

// The smallest believable image files: each format's fixed opening
// bytes followed by filler.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(64, 3)]);

// Uploads a file the way the browser does (a multipart form).
async function upload(buffer, type, name, field = 'image') {
  const form = new FormData();
  if (buffer) {
    form.append(field, new Blob([buffer], { type }), name);
  }
  const response = await fetch(server.base + '/api/upload', { method: 'POST', body: form });
  let body = null;
  try {
    body = await response.json();
  } catch (err) {
    // no JSON body
  }
  return { status: response.status, body };
}

const fileFor = (imageUrl) => path.join(server.uploadDir, path.basename(imageUrl));

before(async () => {
  server = await startTestServer('uploads', 3105);
  admin = await server.register('imageadmin');
  group = await server.createGroup('Pictures', [admin.id]);
  channelId = await server.firstChannelId(group.id);
});

after(async () => {
  await server.stop();
});

test('PNG, JPEG and GIF images are accepted and served back unchanged', async () => {
  for (const [buffer, type, name, extension] of [
    [PNG, 'image/png', 'a.png', 'png'],
    [JPEG, 'image/jpeg', 'b.jpeg', 'jpg'],
    [GIF, 'image/gif', 'c.gif', 'gif'],
  ]) {
    const response = await upload(buffer, type, name);
    assert.equal(response.status, 201, name);
    assert.match(response.body.imageUrl, new RegExp('^/uploads/[a-f0-9]{32}\\.' + extension + '$'));

    const served = await fetch(server.base + response.body.imageUrl);
    assert.equal(served.status, 200);
    assert.ok(Buffer.from(await served.arrayBuffer()).equals(buffer));
  }
});

test('other file types are refused with a clear message', async () => {
  const pdf = await upload(Buffer.from('%PDF-1.4'), 'application/pdf', 'doc.pdf');
  assert.equal(pdf.status, 400);
  assert.match(pdf.body.message, /JPEG, PNG or GIF/);
  assert.equal((await upload(Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg')).status, 400);
  assert.equal((await upload(null)).status, 400);
});

test('a file that only claims to be an image is refused (its first bytes are checked)', async () => {
  const fake = await upload(
    Buffer.from('This is a text file renamed to .png'),
    'image/png',
    'renamed.png',
  );
  assert.equal(fake.status, 400);
});

test('an image over 2 MB is refused; one of exactly 2 MB is accepted', async () => {
  const twoMb = 2 * 1024 * 1024;
  const tooBig = await upload(Buffer.concat([PNG, Buffer.alloc(twoMb)]), 'image/png', 'big.png');
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.body.message, /2 MB/);
  assert.equal(
    (await upload(Buffer.concat([PNG, Buffer.alloc(twoMb - PNG.length)]), 'image/png', 'exact.png'))
      .status,
    201,
  );
});

test('a chat message keeps an uploaded image but drops an outside address', async () => {
  const imageUrl = (await upload(PNG, 'image/png', 'm.png')).body.imageUrl;
  const client = server.connect();
  await wait(150);
  client.emit('joinChannel', { channelId, userId: admin.id, username: 'imageadmin' });
  await wait(250);
  const send = async (extra) => {
    client.emit('sendMessage', {
      channelId,
      senderName: 'imageadmin',
      timestamp: new Date().toISOString(),
      ...extra,
    });
    await wait(250);
  };

  await send({ text: 'with a picture', imageUrl });
  await send({ text: '', imageUrl });
  await send({ text: 'outside', imageUrl: 'http://evil.example/x.png' });
  await send({ text: 'escape', imageUrl: '/uploads/../server.js' });

  const received = client.events.filter((e) => e.event === 'newMessage');
  assert.equal(received.length, 4);
  assert.equal(received[0].imageUrl, imageUrl);
  assert.equal(received[1].imageUrl, imageUrl, 'an image with no text is allowed');
  assert.equal(received[2].imageUrl, undefined);
  assert.equal(received[3].imageUrl, undefined);
  client.close();
});

test('an image file is deleted when its message drops out of the last 5', async () => {
  const fresh = await server.createGroup('Rolling', [admin.id]);
  const rollingChannel = await server.firstChannelId(fresh.id);
  const imageUrl = (await upload(GIF, 'image/gif', 'old.gif')).body.imageUrl;
  const client = server.connect();
  await wait(150);
  client.emit('joinChannel', {
    channelId: rollingChannel,
    userId: admin.id,
    username: 'imageadmin',
  });
  await wait(250);
  const send = async (extra) => {
    client.emit('sendMessage', {
      channelId: rollingChannel,
      senderName: 'imageadmin',
      timestamp: new Date().toISOString(),
      ...extra,
    });
    await wait(200);
  };

  await send({ text: 'the old one', imageUrl });
  for (let n = 1; n <= 4; n++) {
    await send({ text: 'filler ' + n });
  }
  assert.ok(fs.existsSync(fileFor(imageUrl)), 'still there while its message is one of the last 5');

  await send({ text: 'the sixth' });
  await wait(300);
  assert.equal(fs.existsSync(fileFor(imageUrl)), false);
  assert.equal((await fetch(server.base + imageUrl)).status, 404);
  client.close();
});

test('deleting a message deletes its image file too', async () => {
  const imageUrl = (await upload(JPEG, 'image/jpeg', 'gone.jpg')).body.imageUrl;
  const client = server.connect();
  await wait(150);
  client.emit('joinChannel', { channelId, userId: admin.id, username: 'imageadmin' });
  await wait(250);
  client.emit('sendMessage', {
    channelId,
    senderName: 'imageadmin',
    text: 'to delete',
    imageUrl,
    timestamp: new Date().toISOString(),
  });
  await wait(300);
  const sent = client.events.find((e) => e.event === 'newMessage' && e.text === 'to delete');

  client.emit('deleteMessage', { messageId: sent.id });
  await wait(300);
  assert.equal(fs.existsSync(fileFor(imageUrl)), false);
  client.close();
});

test('a profile picture is saved on the user, and replacing it deletes the old file', async () => {
  const user = await server.register('pictureuser');
  const first = (await upload(PNG, 'image/png', 'one.png')).body.imageUrl;
  const second = (await upload(JPEG, 'image/jpeg', 'two.jpg')).body.imageUrl;

  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { profilePicUrl: first })).status,
    204,
  );
  assert.equal(
    (await server.api('GET', '/users')).body.find((u) => u.id === user.id).profilePicUrl,
    first,
  );

  assert.equal(
    (await server.api('PUT', '/users/' + user.id, { profilePicUrl: second })).status,
    204,
  );
  await wait(200);
  assert.equal(fs.existsSync(fileFor(first)), false);
  assert.ok(fs.existsSync(fileFor(second)));

  for (const bad of ['http://evil.example/x.png', '/uploads/../server.js', '']) {
    assert.equal(
      (await server.api('PUT', '/users/' + user.id, { profilePicUrl: bad })).status,
      400,
    );
  }
  assert.equal((await server.userInDb(user.id)).profilePicUrl, second);
});
