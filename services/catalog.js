const { Album, Artist } = require('../db/models');
const songInclude = [{ model: Album, include: [{ model: Artist }] }, { model: Artist }];
const serializeSong = (song) =>
  song.source === 'audius'
    ? {
        songId: song.id,
        source: 'audius',
        sourceId: song.sourceId,
      }
    : {
        songId: song.id,
        source: 'local',
        sourceId: song.sourceId,
        songName: song.songName,
        albumId: null,
        collectionName: song.Album?.albumName,
        artistId: song.artistId || song.Album?.artistId,
        artistName: song.Artist?.artistName || song.Album?.Artist?.artistName || 'Unknown artist',
        audioPath: song.audioPath,
        sourceUrl: song.sourceUrl,
        license: song.license,
        style: song.style,
        duration: song.duration,
      };
const serializeAlbum = (album) => ({
  albumId: album.id,
  source: album.source,
  sourceId: album.sourceId,
});
const playlistSummary = (p) => ({
  playlistId: p.id,
  playList: p.playlistName,
  userId: p.userId,
  savedAt: p.createdAt,
});
module.exports = { songInclude, serializeSong, serializeAlbum, playlistSummary };
