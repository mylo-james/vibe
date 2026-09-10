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
  const starterCount = await Playlist.count({ where: { userId: user.id } });
  for (let index = starterCount; index < MAX_DEMO_PLAYLISTS - 1; index++)
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

test('new demos own a populated library and six playable starter playlists before catalog browsing', async () => {
  const first = await request('/demo', { method: 'POST' });
  const second = await request('/demo', { method: 'POST' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const id = first.data.user.userId;
  const libraryPath = `/users/${id}/library`;
  const saved = await request(libraryPath, { cookie: first.cookie });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.library.length, 34);
  assert.equal(saved.data.albums.length, 6);
  assert.equal(saved.data.library.filter((song) => song.source === 'local').length, 10);
  assert.equal(saved.data.library.filter((song) => song.source === 'audius').length, 24);
  assert.equal(new Set(saved.data.library.map((song) => song.songId)).size, 34);
  const playlists = (await request(`/users/${id}/playlists`, { cookie: first.cookie })).data
    .playlistNames;
  assert.deepEqual(
    playlists.map((playlist) => playlist.playList).sort(),
    [
      'A softer landing',
      'After hours',
      'Electronic drift',
      'Late-night focus',
      'Press start',
      'Turn it up',
    ].sort(),
  );
  for (const playlist of playlists) {
    const tracks = await request(`/playlists/${playlist.playlistId}/songs`, {
      cookie: first.cookie,
    });
    assert.equal(tracks.status, 200);
    assert.ok(tracks.data.songsList.length >= 2);
    assert.ok(
      tracks.data.songsList.every((song) =>
        saved.data.library.some((saved) => saved.songId === song.songId),
      ),
    );
    if (['A softer landing', 'After hours', 'Turn it up'].includes(playlist.playList)) {
      assert.equal(tracks.data.songsList.length, 8);
      assert.ok(tracks.data.songsList.every((song) => song.source === 'audius'));
    } else assert.ok(tracks.data.songsList.every((song) => song.audioPath));
  }
  const song = saved.data.library.find((song) => song.source === 'local');
  assert.equal(
    (
      await request(`${libraryPath}/songs/${song.songId}`, {
        cookie: second.cookie,
        method: 'DELETE',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`${libraryPath}/songs/${song.songId}`, {
        cookie: first.cookie,
        method: 'DELETE',
      })
    ).status,
    204,
  );
  assert.equal((await request(libraryPath, { cookie: first.cookie })).data.library.length, 33);
  const secondSaved = await request(`/users/${second.data.user.userId}/library`, {
    cookie: second.cookie,
  });
  assert.equal(secondSaved.data.library.length, 34);
  assert.ok(secondSaved.data.library.some((saved) => saved.songId === song.songId));
  // Refreshing session/catalog must not silently restore a save the visitor removed.
  await request('/session', { cookie: first.cookie });
  await request('/catalog', { cookie: first.cookie });
  assert.equal((await request(libraryPath, { cookie: first.cookie })).data.library.length, 33);
  const remote = await Song.findOne({ where: { source: 'audius' } });
  assert.equal(remote.songName, null);
  assert.equal(remote.audioPath, null);
});

test('starter collection failure rolls back the demo user and its collection together', async (t) => {
  const counts = async () =>
    Promise.all([
      User.count(),
      Playlist.count(),
      PlaylistSong.count(),
      SavedSong.count(),
      SavedAlbum.count(),
    ]);
  const before = await counts();
  t.mock.method(SavedAlbum, 'bulkCreate', async () => {
    throw new Error('Injected starter failure');
  });
  await assert.rejects(admitDemo(models), /Injected starter failure/);
  assert.deepEqual(await counts(), before);
});
