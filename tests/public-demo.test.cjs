const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
Object.assign(process.env, require('./database.cjs').prepare(), {
  VIBE_PUBLIC_DEMO: '1',
  VERCEL: '1',
  VERCEL_URL: 'vibe-public-demo-123.vercel.app',
  CRON_SECRET: 'test-only-public-demo-cron-secret-123456',
});
const models = require('../db/models');
const { User, Playlist, PlaylistSong, SavedSong, SavedAlbum, UserFriend, Song, Album, sequelize } =
  models;
const app = require('../app');
const { getUserToken } = require('../auth');
const { publicDemoEnabled } = require('../config/public-demo');
const {
  MAX_ACTIVE_DEMOS,
  MAX_DEMO_ADMISSIONS,
  MAX_DEMO_PLAYLISTS,
  admitDemo,
  cleanupPublicDemos,
} = require('../services/demo-policy');

let base;
let server;
let sequence = 0;

async function request(path, { cookie, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}

function cronRequest(headers, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(base);
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        method,
        path: '/api/maintenance/cleanup',
        headers,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response));
      },
    );
    request.once('error', reject);
    request.end();
  });
}

async function demoUser({ expiresAt = new Date(Date.now() + 7200000) } = {}) {
  sequence++;
  return User.create({
    email: `policy-${sequence}@vibe.invalid`,
    userName: `policy${sequence}`,
    hashedPassword: 'policy-only-password',
    demoExpiresAt: expiresAt,
  });
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await sequelize.query(
    'TRUNCATE "PlaylistSongs", "SavedSongs", "SavedAlbums", "Playlists", "UserFriends", "Users" RESTART IDENTITY CASCADE',
  );
  sequence = 0;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('public-demo mode is explicit and disables durable authentication', async () => {
  assert.equal(publicDemoEnabled(), true);
  assert.equal(publicDemoEnabled({ VIBE_PUBLIC_DEMO: 'true' }), false);
  assert.equal((await request('/login', { method: 'POST', body: {} })).status, 404);
  assert.equal((await request('/sign-up', { method: 'POST', body: {} })).status, 404);
  const durable = await User.create({
    email: 'durable@example.test',
    userName: 'durable',
    hashedPassword: 'not-used',
  });
  assert.equal(
    (await request('/session', { cookie: `vibe_session=${getUserToken(durable)}` })).status,
    401,
  );
});

test('public admission is serialized at 39 to 40 and 99 to 100', async () => {
  for (let index = 0; index < MAX_DEMO_ADMISSIONS - 1; index++) await demoUser();
  const rateResults = await Promise.allSettled([admitDemo(models), admitDemo(models)]);
  assert.equal(rateResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(rateResults.filter((result) => result.status === 'rejected').length, 1);

  await sequelize.query(
    'TRUNCATE "PlaylistSongs", "SavedSongs", "SavedAlbums", "Playlists", "UserFriends", "Users" RESTART IDENTITY CASCADE',
  );
  const oldAdmission = new Date(Date.now() - 60 * 60 * 1000);
  for (let index = 0; index < MAX_ACTIVE_DEMOS - 1; index++) {
    await demoUser({ expiresAt: new Date(Date.now() + 7200000) });
  }
  await sequelize.query(
    'UPDATE "Users" SET "createdAt" = :oldAdmission, "updatedAt" = :oldAdmission',
    {
      replacements: { oldAdmission },
    },
  );
  const results = await Promise.allSettled([admitDemo(models), admitDemo(models)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(
    await User.count({ where: { demoExpiresAt: { [models.Sequelize.Op.ne]: null } } }),
    100,
  );
});

test('public demo playlist creation is serialized at 19 to 20 including fixtures', async () => {
  const user = await admitDemo(models);
  for (let index = 0; index < MAX_DEMO_PLAYLISTS - 4; index++)
    await Playlist.create({ playlistName: `mix ${index}`, userId: user.id });
  const cookie = `vibe_session=${getUserToken(user)}`;
  const results = await Promise.all(
    ['twenty', 'too many'].map((playlistName) =>
      request(`/users/${user.id}/playlists`, {
        cookie,
        method: 'POST',
        body: { playlistName },
      }),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 429]);
  assert.equal(await Playlist.count({ where: { userId: user.id } }), MAX_DEMO_PLAYLISTS);
});

test('cleanup deletes only expired demo ownership and cron accepts one exact generated host', async () => {
  const expired = await demoUser({ expiresAt: new Date(0) });
  const durable = await User.create({
    email: 'durable@example.test',
    userName: 'durable',
    hashedPassword: 'durable-password',
  });
  const song = await Song.findOne();
  const album = await Album.findOne();
  const playlist = await Playlist.create({ playlistName: 'expired', userId: expired.id });
  await PlaylistSong.create({ playlistId: playlist.id, songId: song.id, song: song.songName });
  await SavedSong.create({ userId: expired.id, songId: song.id });
  await SavedAlbum.create({ userId: expired.id, albumId: album.id });
  await UserFriend.create({
    userName: expired.userName,
    friendName: durable.userName,
    userId: expired.id,
    friendId: durable.id,
  });
  assert.equal(
    (
      await cronRequest({
        Host: process.env.VERCEL_URL,
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      })
    ).statusCode,
    200,
  );
  assert.equal(await User.findByPk(expired.id), null);
  assert.ok(await User.findByPk(durable.id));
  assert.equal(await PlaylistSong.count(), 0);
  assert.equal(await SavedSong.count(), 0);
  assert.equal(await SavedAlbum.count(), 0);
  assert.equal(await UserFriend.count(), 0);
  assert.equal(await Playlist.count(), 0);

  for (const headers of [
    { Host: process.env.VERCEL_URL },
    { Host: 'other.vercel.app', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    { Host: `${process.env.VERCEL_URL}:443`, Authorization: `Bearer ${process.env.CRON_SECRET}` },
  ])
    assert.equal((await cronRequest(headers)).statusCode, 404);
  assert.equal(
    (
      await cronRequest(
        {
          Host: process.env.VERCEL_URL,
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        'POST',
      )
    ).statusCode,
    404,
  );
  assert.equal(await cleanupPublicDemos(models), 0);
});
