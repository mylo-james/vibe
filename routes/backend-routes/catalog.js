const router = require('express').Router();
const { requireAuth } = require('../../auth');
const { asyncHandler, positiveId, httpError } = require('../../utils');
const { Song, Album } = require('../../db/models');
const { serializeSong, serializeAlbum, songInclude } = require('../../services/catalog');
const refs = require('../../services/catalog-references');
const audius = require('../../services/audius');
router.use(requireAuth);
router.get(
  '/',
  asyncHandler(async (req, res) => res.json(await refs.catalog())),
);
router.get(
  '/metadata',
  asyncHandler(async (req, res) => {
    if (typeof req.query.ids !== 'string') throw httpError(400, 'Provide catalog IDs.');
    const ids = [...new Set(req.query.ids.split(',').map(positiveId))];
    if (!ids.length || ids.length > 25) throw httpError(400, 'Request at most 25 catalog IDs.');
    const songs = await Song.findAll({ where: { id: ids }, include: songInclude });
    if (songs.length !== ids.length) throw httpError(404, 'Catalog item not found.');
    for (const song of songs)
      if (!(await refs.allowedSong(song, req.user.id)))
        throw httpError(404, 'Catalog item not found.');
    const remote = songs.filter((s) => s.source === 'audius');
    const data = remote.length ? await audius.tracks(remote.map((s) => s.sourceId)) : [];
    res.json({
      songs: songs.map((s) =>
        s.source === 'local'
          ? serializeSong(s)
          : audius.normalizeTrack(
              data.find((t) => t.id === s.sourceId),
              serializeSong(s),
            ),
      ),
    });
  }),
);
router.get(
  '/songs/:id/stream',
  asyncHandler(async (req, res) => {
    const song = await Song.findByPk(positiveId(req.params.id), { include: songInclude });
    if (!song || !(await refs.allowedSong(song, req.user.id)))
      throw httpError(404, 'Catalog item not found.');
    if (song.source === 'local')
      return res.json({ url: song.audioPath, song: serializeSong(song) });
    const tracks = await audius.tracks([song.sourceId]);
    const track = tracks.find((t) => t.id === song.sourceId);
    res.json({
      url: audius.stream(track),
      song: audius.normalizeTrack(track, serializeSong(song)),
    });
  }),
);
router.get(
  '/albums/:id',
  asyncHandler(async (req, res) => {
    const album = await Album.findByPk(positiveId(req.params.id));
    if (!album || !(await refs.allowedAlbum(album, req.user.id)))
      throw httpError(404, 'Album not found.');
    const [details, tracks] = await Promise.all([
      audius.read(`/playlists/${album.sourceId}`),
      audius.read(`/playlists/${album.sourceId}/tracks`),
    ]);
    const a = details.find((a) => a.id === album.sourceId);
    if (!a?.is_album || a.is_private || a.is_stream_gated || tracks.length < 2)
      throw httpError(410, 'This release is no longer available as an album.');
    const songs = await Song.findAll({
      where: { source: 'audius', sourceId: tracks.map((t) => t.id) },
    });
    const allowed = [];
    for (const song of songs) if (await refs.allowedSong(song, req.user.id)) allowed.push(song);
    res.json({
      album: {
        ...serializeAlbum(album),
        albumName: a.playlist_name,
        artistName: a.user?.name,
        artwork: audius.artwork(a.artwork),
        sourceUrl: audius.permalink(a.permalink),
        trackCount: tracks.length,
      },
      songs: tracks
        .map((t) => {
          const song = allowed.find((s) => s.sourceId === t.id);
          return song ? audius.normalizeTrack(t, serializeSong(song)) : null;
        })
        .filter(Boolean),
    });
  }),
);
module.exports = router;
