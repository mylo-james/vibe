const catalog = require('../data/catalog.json');
// Idempotent catalog updates preserve playlist membership and existing listeners.
async function importCatalog(queryInterface) {
  const { Artist, Album, Song } = require('../db/models');
  const sequelize = queryInterface ? queryInterface.sequelize : Song.sequelize;
  await sequelize.transaction(async (transaction) => {
    for (const track of catalog) {
      const [artist] = await Artist.findOrCreate({
        where: { artistName: track.artist },
        transaction,
      });
      const [album] = await Album.findOrCreate({
        where: { albumName: track.collection, artistId: artist.id },
        defaults: {
          releaseDate: track.sourceDate,
          source: 'local',
          sourceId: track.collection + ':' + artist.id,
        },
        transaction,
      });
      const values = {
        songName: track.title,
        artistId: artist.id,
        albumId: album.id,
        releaseDate: track.sourceDate,
        audioPath: track.audioPath,
        sourceUrl: track.sourceUrl,
        license: track.license,
        style: track.style,
        duration: track.duration,
      };
      const [song, created] = await Song.findOrCreate({
        where: { audioPath: track.audioPath },
        defaults: { ...values, source: 'local', sourceId: track.audioPath },
        transaction,
      });
      if (!created) await song.update(values, { transaction });
    }
  });
}
module.exports = { importCatalog };
