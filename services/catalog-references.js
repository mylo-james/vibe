const manifest = require('../data/audius-catalog.json');
const {
  Song,
  Album,
  SavedSong,
  SavedAlbum,
  Playlist,
  PlaylistSong,
  Sequelize,
  sequelize,
} = require('../db/models');
const { serializeSong, serializeAlbum, songInclude } = require('./catalog');
async function ensureReferences(transaction) {
  const insert = async (transaction) => {
    // IDs and Vibe's selections only. Provider descriptions stay in session memory.
    await Song.bulkCreate(
      manifest.tracks.map((sourceId) => ({ source: 'audius', sourceId })),
      { ignoreDuplicates: true, transaction },
    );
    await Album.bulkCreate(
      manifest.albums.map((sourceId) => ({ source: 'audius', sourceId })),
      { ignoreDuplicates: true, transaction },
    );
  };
  return transaction ? insert(transaction) : sequelize.transaction(insert);
}
async function catalog() {
  await ensureReferences();
  const songs = await Song.findAll({
    where: {
      [Sequelize.Op.or]: [
        { source: 'audius', sourceId: manifest.tracks },
        { audioPath: { [Sequelize.Op.ne]: null } },
      ],
    },
    include: songInclude,
    order: [['id', 'ASC']],
  });
  const albums = await Album.findAll({ where: { source: 'audius', sourceId: manifest.albums } });
  return {
    songs: songs.map(serializeSong),
    albums: manifest.albums.map((id) => serializeAlbum(albums.find((a) => a.sourceId === id))),
    sections: manifest.sections,
  };
}
async function allowedSong(song, userId) {
  if (song.source === 'local') return Boolean(song.audioPath);
  if (manifest.tracks.includes(song.sourceId)) return true;
  if (await SavedSong.findOne({ where: { songId: song.id, userId } })) return true;
  return Boolean(
    await PlaylistSong.findOne({
      where: { songId: song.id },
      include: [{ model: Playlist, where: { userId } }],
    }),
  );
}
async function allowedAlbum(album, userId) {
  return (
    album.source === 'audius' &&
    (manifest.albums.includes(album.sourceId) ||
      Boolean(await SavedAlbum.findOne({ where: { albumId: album.id, userId } })))
  );
}
module.exports = { manifest, ensureReferences, catalog, allowedSong, allowedAlbum };
