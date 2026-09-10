const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
Object.assign(process.env, require('./database.cjs').prepare());
const { sequelize, User, Playlist, PlaylistSong, Song } = require('../db/models');
const { importCatalog } = require('../services/import-catalog');
const app = require('../app');
let server, base, alice, bob, songId, playlistId, fixturePassword;
async function request(path, { cookie, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + '/api' + path, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = res.status === 204 ? null : await res.json();
  return {
    status: res.status,
    data,
    cookie: res.headers.get('set-cookie')?.split(';')[0],
    headers: res.headers,
  };
}
const credentials = (name) => ({
  userName: name,
  email: `${name}@example.test`,
  confirmEmail: `${name}@example.test`,
  password: 'a longer test passphrase',
  confirmPassword: 'a longer test passphrase',
});
before(async () => {
  fixturePassword = await require('bcryptjs').hash(credentials('alice').password, 10);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await sequelize.query(
    'TRUNCATE "PlaylistSongs", "Playlists", "UserFriends", "Users", "Songs", "Albums", "Artists" RESTART IDENTITY CASCADE',
  );
  await importCatalog();
  const fixtures = [];
  for (const name of ['alice', 'bob']) {
    const user = await User.create({
      userName: name,
      email: `${name}@example.test`,
      hashedPassword: fixturePassword,
    });
    fixtures.push({
      data: { user: { userId: user.id } },
      cookie: 'vibe_session=' + require('../auth').getUserToken(user),
    });
  }
  [alice, bob] = fixtures;
  songId = (await Song.findOne()).id;
  const playlist = await request(`/users/${alice.data.user.userId}/playlists`, {
    cookie: alice.cookie,
    method: 'POST',
    body: { playlistName: 'Alice mix' },
  });
  playlistId = playlist.data.playlistId;
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await sequelize.close();
});
test('playlist covers follow first membership order, update on removal and remain private', async () => {
  const path = `/users/${alice.data.user.userId}/playlists`;
  const summary = async () =>
    (await request(path, { cookie: alice.cookie })).data.playlistNames.find(
      (p) => p.playlistId === playlistId,
    );
  assert.equal((await summary()).firstSong, null);
  const songs = await Song.findAll({ order: [['id', 'DESC']], limit: 2 });
  for (const song of songs)
    assert.equal(
      (
        await request(`/playlists/${playlistId}/songs`, {
          cookie: alice.cookie,
          method: 'POST',
          body: { songId: song.id },
        })
      ).status,
      201,
    );
  assert.equal((await summary()).firstSong.songId, songs[0].id);
  assert.equal((await summary()).firstSong.songName, songs[0].songName);
  const searched = await request('/search?searchInput=Alice', { cookie: alice.cookie });
  assert.equal(searched.data.playlistNames[0].firstSong.songId, songs[0].id);
  assert.equal((await request(path, { cookie: bob.cookie })).status, 403);
  for (const [index, song] of songs.entries()) {
    await request(`/playlists/${playlistId}/songs/${song.id}`, {
      cookie: alice.cookie,
      method: 'DELETE',
    });
    assert.equal((await summary()).firstSong?.songId || null, songs[index + 1]?.id || null);
  }
});
test('login and session restore the actual account in an HttpOnly cookie', async () => {
  const login = await request('/login', { method: 'POST', body: credentials('alice') });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.userId, alice.data.user.userId);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal(login.data.token, undefined);
  const session = await request('/session', { cookie: login.cookie });
  assert.equal(session.data.user.userId, alice.data.user.userId);
  assert.notEqual(session.data.user.userId, bob.data.user.userId);
  const secure = await request('/login', {
    method: 'POST',
    body: credentials('alice'),
    headers: { 'X-Forwarded-Proto': 'https' },
  });
  assert.match(secure.headers.get('set-cookie'), /Secure/);
});
test('invalid credentials and malformed, expired, or absent sessions return 401', async () => {
  assert.equal(
    (
      await request('/login', {
        method: 'POST',
        body: { email: 'alice@example.test', password: 'incorrect' },
      })
    ).status,
    401,
  );
  for (const cookie of [
    undefined,
    'vibe_session=bad',
    'vibe_session=' +
      require('jsonwebtoken').sign({ sub: '1' }, process.env.JWT_SECRET, {
        issuer: 'vibe',
        audience: 'vibe-web',
        expiresIn: -1,
      }),
  ])
    assert.equal((await request('/session', { cookie })).status, 401);
  for (const path of [
    '/songs',
    '/search?searchInput=',
    `/users/${alice.data.user.userId}/library`,
    `/playlists/${playlistId}/songs`,
  ])
    assert.equal((await request(path)).status, 401);
});
test('signup checks both confirmations, password length, uniqueness and body types', async () => {
  for (const patch of [
    { confirmEmail: 'different@example.test' },
    { confirmPassword: 'different' },
    { password: 'short', confirmPassword: 'short' },
    { userName: '' },
    { email: {} },
  ]) {
    assert.equal(
      (await request('/sign-up', { method: 'POST', body: { ...credentials('invalid'), ...patch } }))
        .status,
      400,
    );
  }
  assert.equal(
    (await request('/sign-up', { method: 'POST', body: credentials('alice') })).status,
    409,
  );
});
test('all playlist and account routes reject another listener and preserve stored data', async () => {
  const cookie = bob.cookie;
  for (const [path, method, body] of [
    [`/users/${alice.data.user.userId}`, 'GET'],
    [`/users/${alice.data.user.userId}/library`, 'GET'],
    [`/users/${alice.data.user.userId}/playlists`, 'GET'],
    [`/users/${alice.data.user.userId}/playlists`, 'POST', { playlistName: 'intrusion' }],
    [`/playlists/${playlistId}`, 'GET'],
    [`/playlists/${playlistId}/songs`, 'GET'],
    [`/playlists/${playlistId}/edit`, 'PUT', { playlistName: 'intrusion' }],
    [`/playlists/${playlistId}/delete`, 'DELETE'],
    [`/playlists/${playlistId}/songs`, 'POST', { songId }],
    [`/playlists/${playlistId}/songs/${songId}`, 'DELETE'],
  ])
    assert.equal((await request(path, { cookie, method, body })).status, 403, `${method} ${path}`);
  assert.equal((await Playlist.findByPk(playlistId)).playlistName, 'Alice mix');
  assert.equal(await Playlist.count(), 1);
  assert.equal(await PlaylistSong.count(), 0);
});
test('invalid identifiers, missing items and literal punctuation search have predictable responses', async () => {
  const cookie = alice.cookie;
  for (const id of ['abc', '0', '-1', '1abc', '9007199254740992'])
    assert.equal((await request(`/playlists/${id}`, { cookie })).status, 400);
  assert.equal((await request('/playlists/999999', { cookie })).status, 404);
  assert.equal((await request('/songs/999999', { cookie })).status, 404);
  assert.equal((await request('/search', { cookie })).status, 400);
  for (const query of ['[', '.*', '(a+)+$', '<img>', 'chill', 'Juhani Junkala'])
    assert.equal(
      (await request('/search?searchInput=' + encodeURIComponent(query), { cookie })).status,
      200,
    );
  assert.equal((await request('/search?searchInput[]=chill', { cookie })).status, 400);
});
test('playlist saves are deduplicated under concurrent requests; Library stays independent', async () => {
  const cookie = alice.cookie;
  const adds = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(`/playlists/${playlistId}/songs`, { cookie, method: 'POST', body: { songId } }),
    ),
  );
  assert.ok(
    adds.every((r) => [200, 201].includes(r.status)),
    JSON.stringify(adds),
  );
  assert.equal(await PlaylistSong.count({ where: { playlistId, songId } }), 1);
  const second = await request(`/users/${alice.data.user.userId}/playlists`, {
    cookie,
    method: 'POST',
    body: { playlistName: 'Another mix' },
  });
  await request(`/playlists/${second.data.playlistId}/songs`, {
    cookie,
    method: 'POST',
    body: { songId },
  });
  assert.equal(
    (await request(`/users/${alice.data.user.userId}/library`, { cookie })).data.library.length,
    0,
  );
  assert.equal(
    (await request(`/playlists/${second.data.playlistId}/delete`, { cookie, method: 'DELETE' }))
      .status,
    204,
  );
  assert.equal(await PlaylistSong.count({ where: { playlistId: second.data.playlistId } }), 0);
  assert.equal(await Playlist.findByPk(second.data.playlistId), null);
});
test('rename and removal persist before the response completes', async () => {
  const cookie = alice.cookie;
  await PlaylistSong.create({ playlistId, songId, song: 'Chills' });
  assert.equal(await PlaylistSong.count({ where: { playlistId, songId } }), 1);
  assert.equal(
    (
      await request(`/playlists/${playlistId}/edit`, {
        cookie,
        method: 'PUT',
        body: { playlistName: 'Updated mix' },
      })
    ).status,
    200,
  );
  assert.equal((await Playlist.findByPk(playlistId)).playlistName, 'Updated mix');
  assert.equal(
    (await request(`/playlists/${playlistId}/songs/${songId}`, { cookie, method: 'DELETE' }))
      .status,
    204,
  );
  assert.equal(await PlaylistSong.count({ where: { playlistId } }), 0);
});
test('cross-origin writes are denied without modifying data', async () => {
  const result = await request(`/playlists/${playlistId}/edit`, {
    cookie: alice.cookie,
    method: 'PUT',
    body: { playlistName: 'forged' },
    headers: { Origin: 'https://another.example' },
  });
  assert.equal(result.status, 403);
  assert.equal((await Playlist.findByPk(playlistId)).playlistName, 'Alice mix');
});
test('demos are private, expire, and clean up only expired demo data', async () => {
  const first = await request('/demo', { method: 'POST' });
  const second = await request('/demo', { method: 'POST' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.data.user.userId, second.data.user.userId);
  const owned = (
    await request(`/users/${first.data.user.userId}/playlists`, { cookie: first.cookie })
  ).data.playlistNames;
  assert.equal(owned.length, 6);
  assert.equal(
    (await request(`/playlists/${owned[0].playlistId}/songs`, { cookie: second.cookie })).status,
    403,
  );
  await User.update({ demoExpiresAt: new Date(0) }, { where: { id: first.data.user.userId } });
  assert.equal((await request('/session', { cookie: first.cookie })).status, 401);
  await request('/demo', { method: 'POST' });
  assert.equal(await User.findByPk(first.data.user.userId), null);
  assert.ok(await User.findByPk(alice.data.user.userId));
  assert.ok(await User.findByPk(second.data.user.userId));
});
test('catalog sync preserves IDs and memberships and audio supports seeking', async () => {
  const membership = await PlaylistSong.create({ playlistId, songId, song: 'Chills' });
  const before = await Song.findAll({
    attributes: ['id', 'audioPath'],
    raw: true,
    order: [['id', 'ASC']],
  });
  await importCatalog();
  assert.deepEqual(
    await Song.findAll({ attributes: ['id', 'audioPath'], raw: true, order: [['id', 'ASC']] }),
    before,
  );
  assert.equal((await PlaylistSong.findByPk(membership.id)).songId, songId);
  const res = await fetch(base + before[0].audioPath, { headers: { Range: 'bytes=0-99' } });
  assert.equal(res.status, 206);
  assert.equal((await res.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(base + '/public/test_music/HideandSeek.mp3')).status, 404);
});
test('logout clears the browser session cookie', async () => {
  const result = await request('/logout', { method: 'POST', cookie: alice.cookie });
  assert.equal(result.status, 204);
  assert.match(result.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
});

test('integrity migration upgrades duplicate legacy memberships without losing the surviving link', async () => {
  const migration = require('../db/migrations/20260909000100-catalog-and-demo-integrity');
  const q = sequelize.getQueryInterface();
  const fields = ['id', 'audioPath', 'sourceUrl', 'license', 'style', 'duration'];
  const metadata = await Song.findAll({ attributes: fields, raw: true });
  await migration.down(q);
  const timestamp = new Date();
  const rows = await q.bulkInsert(
    'PlaylistSongs',
    [
      { song: 'legacy', playlistId, songId, createdAt: timestamp, updatedAt: timestamp },
      { song: 'duplicate', playlistId, songId, createdAt: timestamp, updatedAt: timestamp },
    ],
    { returning: true },
  );
  await migration.up(q, require('sequelize'));
  try {
    const entries = await PlaylistSong.findAll({ where: { playlistId, songId } });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, rows[0].id);
    assert.ok(await User.findByPk(alice.data.user.userId));
    assert.ok(await Song.findByPk(songId));
    await assert.rejects(PlaylistSong.create({ song: 'another duplicate', playlistId, songId }), {
      name: 'SequelizeUniqueConstraintError',
    });
  } finally {
    // The rollback deliberately removes new metadata columns. Restore this test fixture by ID.
    for (const { id, ...values } of metadata) await Song.update(values, { where: { id } });
  }
  assert.equal(
    (await Song.findByPk(songId)).audioPath,
    require('../data/catalog.json')[0].audioPath,
  );
});

test('catalog references support true standalone tracks and never persist remote descriptions', async () => {
  const cookie = alice.cookie;
  const first = await request('/catalog', { cookie });
  assert.equal(first.status, 200);
  assert.equal(first.data.songs.filter((s) => s.source === 'audius').length, 100);
  assert.equal(first.data.albums.length, 6);
  assert.equal(first.data.songs.filter((s) => s.source === 'local').length, 10);
  const before = first.data.songs.map((s) => s.songId);
  assert.deepEqual(
    (await request('/catalog', { cookie })).data.songs.map((s) => s.songId),
    before,
  );
  const remote = await Song.findOne({ where: { source: 'audius' } });
  for (const key of [
    'songName',
    'albumId',
    'artistId',
    'audioPath',
    'sourceUrl',
    'license',
    'style',
    'duration',
  ])
    assert.equal(remote[key], null, key);
  assert.deepEqual(Object.keys(first.data.songs.find((s) => s.source === 'audius')).sort(), [
    'songId',
    'source',
    'sourceId',
  ]);
  const a = require('../services/audius'),
    original = a.tracks;
  a.tracks = async (ids) =>
    ids.map((id) => ({
      id,
      title: '<img onerror=alert(1)>',
      user: { name: 'Artist', handle: 'artist', wallet: 'private' },
      is_streamable: true,
      is_stream_gated: false,
      access: { stream: true },
      stream_conditions: null,
      album_backlink: null,
      duration: 120,
      genre: 'Electronic',
      stream: { url: 'https://v.monophonic.digital/audio?signature=temporary' },
      permalink: '/artist/original',
    }));
  try {
    const metadata = await request('/catalog/metadata?ids=' + remote.id, { cookie });
    assert.equal(metadata.status, 200);
    assert.match(metadata.headers.get('cache-control'), /no-store/);
    assert.equal(metadata.data.songs[0].standalone, true);
    assert.equal(metadata.data.songs[0].songName, '<img onerror=alert(1)>');
    assert.equal(JSON.stringify(metadata.data).includes('private'), false);
    assert.equal(JSON.stringify(metadata.data).includes('signature'), false);
    const stream = await request(`/catalog/songs/${remote.id}/stream`, { cookie });
    assert.equal(stream.status, 200);
    assert.match(stream.data.url, /signature=temporary/);
    assert.equal((await remote.reload()).songName, null);
    assert.equal(
      (
        await request(
          '/catalog/metadata?ids=' + Array.from({ length: 26 }, (_, i) => i + 1).join(','),
          { cookie },
        )
      ).status,
      400,
    );
    assert.equal(
      (await request('/catalog/metadata?ids=https://example.org', { cookie })).status,
      400,
    );
    a.tracks = async (ids) =>
      ids.map((id) => ({
        id,
        is_streamable: true,
        is_stream_gated: true,
        access: { stream: false },
      }));
    assert.equal((await request(`/catalog/songs/${remote.id}/stream`, { cookie })).status, 410);
  } finally {
    a.tracks = original;
  }
});
test('concurrent song and album saves are private and independent of playlist membership', async () => {
  await request('/catalog', { cookie: alice.cookie });
  const { SavedSong, SavedAlbum, Album } = require('../db/models');
  const remote = await Song.findOne({ where: { source: 'audius' } }),
    album = await Album.findOne({ where: { source: 'audius' } });
  const cookie = alice.cookie,
    userId = alice.data.user.userId;
  const path = `/users/${userId}/library/songs/${remote.id}`;
  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(path, { cookie, method: 'PUT', body: { songName: 'must not persist' } }),
    ),
  );
  assert.ok(responses.every((r) => [200, 201].includes(r.status)));
  assert.equal(await SavedSong.count({ where: { userId, songId: remote.id } }), 1);
  assert.equal((await request(path, { cookie: bob.cookie, method: 'DELETE' })).status, 403);
  assert.equal(
    (await request(`/users/${userId}/library/albums/${album.id}`, { cookie, method: 'PUT' }))
      .status,
    201,
  );
  assert.equal(await SavedAlbum.count({ where: { userId } }), 1);
  assert.equal(
    await SavedSong.count({ where: { userId } }),
    1,
    'Saving an album must not save its tracks',
  );
  await request(`/playlists/${playlistId}/songs`, {
    cookie,
    method: 'POST',
    body: { songId: remote.id },
  });
  await request(path, { cookie, method: 'DELETE' });
  assert.equal(await PlaylistSong.count({ where: { playlistId, songId: remote.id } }), 1);
  await request(path, { cookie, method: 'PUT' });
  await request(`/playlists/${playlistId}/songs/${remote.id}`, { cookie, method: 'DELETE' });
  assert.equal(await SavedSong.count({ where: { userId, songId: remote.id } }), 1);
  assert.equal((await remote.reload()).songName, null);
  assert.equal(
    (await request(`/users/${bob.data.user.userId}/library`, { cookie: bob.cookie })).data.library
      .length,
    0,
  );
  const hidden = await Song.create({ source: 'audius', sourceId: 'retired-private-reference' });
  assert.equal(
    (await request(`/catalog/metadata?ids=${hidden.id}`, { cookie: bob.cookie })).status,
    404,
  );
});
test('feature migration rolls back atomically and copies legacy Library only once', async () => {
  const q = sequelize.getQueryInterface(),
    S = require('sequelize');
  const migration = require('../db/migrations/20260909000300-independent-library');
  const { SavedSong, SavedAlbum } = require('../db/models');
  // Dedicated test database only. Rebuild the feature on existing accounts and playlists.
  await SavedSong.destroy({ where: {} });
  await SavedAlbum.destroy({ where: {} });
  await PlaylistSong.destroy({
    where: {
      songId: (await Song.findAll({ where: { source: 'audius' }, attributes: ['id'] })).map(
        (s) => s.id,
      ),
    },
  });
  await Song.destroy({ where: { source: 'audius' } });
  await require('../db/models').Album.destroy({ where: { source: 'audius' } });
  await PlaylistSong.findOrCreate({ where: { playlistId, songId }, defaults: { song: 'legacy' } });
  await migration.down(q);
  const original = q.createTable;
  q.createTable = async function (name, ...args) {
    if (name === 'SavedAlbums') throw Error('injected rollback');
    return original.call(this, name, ...args);
  };
  try {
    await assert.rejects(migration.up(q, S), /injected rollback/);
  } finally {
    q.createTable = original;
  }
  assert.equal((await q.describeTable('Songs')).source, undefined);
  assert.equal((await q.showAllTables()).includes('SavedSongs'), false);
  await migration.up(q, S);
  assert.equal((await q.describeTable('Songs')).albumId.allowNull, true);
  assert.equal((await q.describeTable('Albums')).artistId.allowNull, true);
  assert.equal(await SavedSong.count({ where: { userId: alice.data.user.userId, songId } }), 1);
  assert.equal(await PlaylistSong.count({ where: { playlistId, songId } }), 1);
  await SavedSong.destroy({ where: { userId: alice.data.user.userId, songId } });
  const result = require('node:child_process').spawnSync(
    process.execPath,
    ['-r', 'dotenv/config', 'node_modules/sequelize-cli/lib/sequelize', 'db:migrate'],
    { env: process.env, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    await SavedSong.count({ where: { userId: alice.data.user.userId, songId } }),
    0,
    'startup must not restore a removed save',
  );
  const demo = await request('/demo', { method: 'POST' });
  const did = demo.data.user.userId;
  assert.equal(await SavedSong.count({ where: { userId: did, songId } }), 1);
  await User.update({ demoExpiresAt: new Date(0) }, { where: { id: did } });
  await request('/demo', { method: 'POST' });
  assert.equal(await SavedSong.count({ where: { userId: did } }), 0);
  assert.ok(await User.findByPk(alice.data.user.userId));
});

test('search returns literal, meaningful results without leaking another account or missing-field text', async () => {
  const cookie = alice.cookie;
  const literal = await Playlist.create({
    userId: alice.data.user.userId,
    playlistName: '[late].*',
  });
  await Playlist.create({ userId: bob.data.user.userId, playlistName: '[late].* private' });
  for (const text of ['[', '.*']) {
    const result = await request('/search?searchInput=' + encodeURIComponent(text), { cookie });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.songsList, []);
    assert.deepEqual(
      result.data.playlistNames.map((p) => p.playlistId),
      [literal.id],
    );
  }
  const artist = await request('/search?searchInput=holizna%20chills', { cookie });
  assert.deepEqual(
    artist.data.songsList.map((s) => s.songId),
    [songId],
  );
  const absent = await request('/search?searchInput=undefined', { cookie });
  assert.deepEqual(absent.data.songsList, []);
  const song = await Song.findByPk(songId);
  await require('../db/models').Album.update(
    { albumName: 'Lost tape anthology' },
    { where: { id: song.albumId } },
  );
  const collection = await request('/search?searchInput=lost%20tape', { cookie });
  assert.deepEqual(
    collection.data.songsList.map((s) => s.songId),
    [songId],
  );
});

test('album API preserves provider order, excludes noncatalog songs and rejects unavailable releases', async (t) => {
  const catalog = (await request('/catalog', { cookie: alice.cookie })).data;
  const album = catalog.albums[0],
    refs = catalog.songs.filter((s) => s.source === 'audius').slice(0, 2);
  let details = {
    id: album.sourceId,
    is_album: true,
    playlist_name: 'An original release',
    user: { name: 'Artist' },
    permalink: '/artist/release',
  };
  let tracks = [refs[1], { sourceId: 'not-in-vibe' }, refs[0]].map((r) => ({
    id: r.sourceId,
    title: r.sourceId,
    is_streamable: true,
    is_stream_gated: false,
    access: { stream: true },
    user: { name: 'Artist' },
  }));
  t.mock.method(require('../services/audius'), 'read', async (path) =>
    path.endsWith('/tracks') ? tracks : [details],
  );
  const response = await request(`/catalog/albums/${album.albumId}`, { cookie: alice.cookie });
  assert.equal(response.status, 200);
  assert.equal(response.data.album.trackCount, 3);
  assert.deepEqual(
    response.data.songs.map((s) => s.songId),
    [refs[1].songId, refs[0].songId],
  );
  assert.equal((await require('../db/models').Album.findByPk(album.albumId)).albumName, null);
  for (const patch of [{ is_private: true }, { is_stream_gated: true }, { is_album: false }]) {
    const prior = details;
    details = { ...prior, ...patch };
    assert.equal(
      (await request(`/catalog/albums/${album.albumId}`, { cookie: alice.cookie })).status,
      410,
    );
    details = prior;
  }
  tracks = tracks.slice(0, 1);
  assert.equal(
    (await request(`/catalog/albums/${album.albumId}`, { cookie: alice.cookie })).status,
    410,
  );
  assert.equal((await request('/catalog/albums/999999', { cookie: alice.cookie })).status, 404);
});

test('retired references are readable only through the current listener saved items or playlists', async (t) => {
  const { SavedSong, SavedAlbum, Album } = require('../db/models');
  const song = await Song.create({ source: 'audius', sourceId: 'retiredcoverage' });
  const album = await Album.create({ source: 'audius', sourceId: 'retiredrelease' });
  const userId = alice.data.user.userId;
  t.mock.method(require('../services/audius'), 'tracks', async (ids) =>
    ids.map((id) => ({
      id,
      title: 'Retired original',
      is_streamable: true,
      is_stream_gated: false,
      access: { stream: true },
    })),
  );
  const path = `/catalog/metadata?ids=${song.id}`;
  assert.equal((await request(path, { cookie: alice.cookie })).status, 404);
  assert.equal(
    (
      await request(`/users/${userId}/library/songs/${song.id}`, {
        cookie: alice.cookie,
        method: 'PUT',
      })
    ).status,
    404,
  );
  await SavedSong.create({ userId, songId: song.id });
  assert.equal((await request(path, { cookie: alice.cookie })).status, 200);
  assert.equal((await request(path, { cookie: bob.cookie })).status, 404);
  await PlaylistSong.create({ playlistId, songId: song.id });
  await SavedSong.destroy({ where: { userId, songId: song.id } });
  assert.equal((await request(path, { cookie: alice.cookie })).status, 200);
  await PlaylistSong.destroy({ where: { songId: song.id } });
  assert.equal((await request(path, { cookie: alice.cookie })).status, 404);
  assert.equal(await require('../services/catalog-references').allowedAlbum(album, userId), false);
  await SavedAlbum.create({ userId, albumId: album.id });
  assert.equal(await require('../services/catalog-references').allowedAlbum(album, userId), true);
  assert.equal(
    await require('../services/catalog-references').allowedAlbum(album, bob.data.user.userId),
    false,
  );
  const local = (await request(`/catalog/songs/${songId}/stream`, { cookie: alice.cookie })).data;
  assert.equal(local.url, require('../data/catalog.json')[0].audioPath);
  assert.equal((await request('/catalog/metadata', { cookie: alice.cookie })).status, 400);
  assert.equal(
    (await request('/catalog/metadata?ids=999999', { cookie: alice.cookie })).status,
    404,
  );
});
