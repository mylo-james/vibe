const { randomBytes, timingSafeEqual } = require('node:crypto');
const { Op } = require('sequelize');
const { publicDemoEnabled } = require('../config/public-demo');

const DEMO_DURATION_MS = 2 * 60 * 60 * 1000;
const DEMO_ADMISSION_WINDOW_MS = 15 * 60 * 1000;
const MAX_ACTIVE_DEMOS = 100;
const MAX_DEMO_ADMISSIONS = 40;
const MAX_DEMO_PLAYLISTS = 20;
const DEMO_POLICY_LOCK = 835_204_619;
const DEMO_PLAYLIST_LOCK = 835_204_620;
const CRON_PATH = '/maintenance/cleanup';

function generatedVercelHost(env = process.env) {
  const host = env.VERCEL_URL;
  return typeof host === 'string' && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(host)
    ? host
    : undefined;
}

function cronAuthorized(req, env = process.env) {
  if (!publicDemoEnabled(env) || env.VERCEL !== '1' || req.method !== 'GET') return false;
  const host = generatedVercelHost(env);
  if (!host || req.get('host') !== host) return false;
  const secret = env.CRON_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) return false;
  const received = Buffer.from(req.get('authorization') || '', 'utf8');
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function lock(sequelize, transaction, key, userId) {
  await sequelize.query("SET LOCAL lock_timeout = '3s'", { transaction });
  await sequelize.query("SET LOCAL statement_timeout = '10s'", { transaction });
  const replacements = userId === undefined ? { key } : { key, userId };
  const statement =
    userId === undefined
      ? 'SELECT pg_advisory_xact_lock(:key)'
      : 'SELECT pg_advisory_xact_lock(:key, :userId)';
  await sequelize.query(statement, { replacements, transaction });
}

async function removeExpiredDemoUsers(models, transaction, now = new Date()) {
  const { User, Playlist, PlaylistSong, SavedSong, SavedAlbum, UserFriend } = models;
  const expired = await User.findAll({
    where: { demoExpiresAt: { [Op.lte]: now } },
    attributes: ['id'],
    transaction,
  });
  const userIds = expired.map((user) => user.id);
  if (!userIds.length) return 0;
  const playlists = await Playlist.findAll({
    where: { userId: userIds },
    attributes: ['id'],
    transaction,
  });
  const playlistIds = playlists.map((playlist) => playlist.id);
  if (playlistIds.length)
    await PlaylistSong.destroy({ where: { playlistId: playlistIds }, transaction });
  await SavedSong.destroy({ where: { userId: userIds }, transaction });
  await SavedAlbum.destroy({ where: { userId: userIds }, transaction });
  await UserFriend.destroy({
    where: { [Op.or]: [{ userId: userIds }, { friendId: userIds }] },
    transaction,
  });
  await Playlist.destroy({ where: { userId: userIds }, transaction });
  await User.destroy({ where: { id: userIds }, transaction });
  return userIds.length;
}

async function createStarterCollection(models, user, transaction) {
  const { Playlist, PlaylistSong, Song, Album, SavedSong, SavedAlbum } = models;
  const { manifest, ensureReferences } = require('./catalog-references');
  await ensureReferences(transaction);
  const localSongs = await Song.findAll({
    where: { audioPath: { [Op.ne]: null } },
    order: [['id', 'ASC']],
    transaction,
  });
  const selectedIds = [...new Set(manifest.sections.flatMap((section) => section.trackIds))];
  const remoteSongs = await Song.findAll({
    where: { source: 'audius', sourceId: selectedIds },
    transaction,
  });
  const bySourceId = new Map(remoteSongs.map((song) => [song.sourceId, song]));
  const albums = await Album.findAll({
    where: { source: 'audius', sourceId: manifest.albums },
    order: [['id', 'ASC']],
    transaction,
  });
  await SavedSong.bulkCreate(
    [...selectedIds.map((id) => bySourceId.get(id)), ...localSongs].map((song) => ({
      userId: user.id,
      songId: song.id,
    })),
    { transaction },
  );
  await SavedAlbum.bulkCreate(
    albums.map((album) => ({ userId: user.id, albumId: album.id })),
    { transaction },
  );
  const selections = [];
  for (const [name, style] of [
    ['Late-night focus', 'Chill'],
    ['Press start', 'Chiptune'],
    ['Electronic drift', 'Electronic'],
  ])
    selections.push({ name, songs: localSongs.filter((song) => song.style === style) });
  for (const section of manifest.sections)
    selections.push({
      name: section.name,
      songs: section.trackIds.map((id) => bySourceId.get(id)),
    });
  for (const { name, songs } of selections) {
    const playlist = await Playlist.create(
      { playlistName: name, userId: user.id },
      { transaction },
    );
    await PlaylistSong.bulkCreate(
      songs.map((song) => ({ song: song.songName, songId: song.id, playlistId: playlist.id })),
      { transaction },
    );
  }
}

async function admitDemo(models, { publicDemo = publicDemoEnabled() } = {}) {
  const { sequelize, User } = models;
  const now = new Date();
  const id = randomBytes(8).toString('hex');
  const hashedPassword = await require('bcryptjs').hash(randomBytes(24).toString('hex'), 10);
  return sequelize.transaction(async (transaction) => {
    if (publicDemo) await lock(sequelize, transaction, DEMO_POLICY_LOCK);
    await removeExpiredDemoUsers(models, transaction, now);
    if (publicDemo) {
      const active = await User.count({
        where: { demoExpiresAt: { [Op.gt]: now } },
        transaction,
      });
      if (active >= MAX_ACTIVE_DEMOS)
        throw Object.assign(new Error('The demo is at capacity. Please try again soon.'), {
          status: 429,
        });
      const admittedRecently = await User.count({
        where: {
          demoExpiresAt: { [Op.ne]: null },
          createdAt: { [Op.gte]: new Date(now.getTime() - DEMO_ADMISSION_WINDOW_MS) },
        },
        transaction,
      });
      if (admittedRecently >= MAX_DEMO_ADMISSIONS)
        throw Object.assign(new Error('The demo is busy. Please try again in a few minutes.'), {
          status: 429,
        });
    }
    const user = await User.create(
      {
        email: `demo-${id}@vibe.invalid`,
        userName: `demo${id}`,
        hashedPassword,
        demoExpiresAt: new Date(now.getTime() + DEMO_DURATION_MS),
      },
      { transaction },
    );
    await createStarterCollection(models, user, transaction);
    return user;
  });
}

async function cleanupPublicDemos(models) {
  return models.sequelize.transaction(async (transaction) => {
    await lock(models.sequelize, transaction, DEMO_POLICY_LOCK);
    return removeExpiredDemoUsers(models, transaction);
  });
}

async function createPlaylist(models, user, playlistName) {
  if (!publicDemoEnabled() || !user.demoExpiresAt)
    return models.Playlist.create({ playlistName, userId: user.id });
  return models.sequelize.transaction(async (transaction) => {
    await lock(models.sequelize, transaction, DEMO_PLAYLIST_LOCK, user.id);
    const count = await models.Playlist.count({ where: { userId: user.id }, transaction });
    if (count >= MAX_DEMO_PLAYLISTS)
      throw Object.assign(new Error('Demo playlists are limited to 20.'), { status: 429 });
    return models.Playlist.create({ playlistName, userId: user.id }, { transaction });
  });
}

module.exports = {
  CRON_PATH,
  MAX_ACTIVE_DEMOS,
  MAX_DEMO_ADMISSIONS,
  MAX_DEMO_PLAYLISTS,
  admitDemo,
  cleanupPublicDemos,
  createPlaylist,
  cronAuthorized,
  generatedVercelHost,
  publicDemoEnabled,
  removeExpiredDemoUsers,
};
