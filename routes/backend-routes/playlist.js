const router = require('express').Router();
const { body } = require('express-validator');
const { Playlist, PlaylistSong, Song, sequelize } = require('../../db/models');
const { requireAuth } = require('../../auth');
const { asyncHandler, positiveId, httpError, handleValidationErrors } = require('../../utils');
const { songInclude, serializeSong } = require('../../services/catalog');
router.use(requireAuth);
router.param(
  'id',
  asyncHandler(async (req, res, next) => {
    const playlist = await Playlist.findByPk(positiveId(req.params.id));
    if (!playlist) throw httpError(404, 'Playlist not found.');
    if (playlist.userId !== req.user.id)
      throw httpError(403, 'This playlist belongs to another listener.');
    req.playlist = playlist;
    next();
  }),
);
router.get('/:id', (req, res) => res.json({ playlistName: req.playlist.playlistName }));
router.put(
  '/:id/edit',
  body('playlistName')
    .isString()
    .bail()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Use a playlist name between 1 and 50 characters.'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    await req.playlist.update({ playlistName: req.body.playlistName });
    res.json({ playlistName: req.playlist.playlistName });
  }),
);
router.delete(
  '/:id/delete',
  asyncHandler(async (req, res) => {
    await sequelize.transaction(async (transaction) => {
      await PlaylistSong.destroy({ where: { playlistId: req.playlist.id }, transaction });
      await req.playlist.destroy({ transaction });
    });
    res.status(204).end();
  }),
);
router.get(
  '/:id/songs',
  asyncHandler(async (req, res) => {
    const entries = await PlaylistSong.findAll({
      where: { playlistId: req.playlist.id },
      include: [{ model: Song, include: songInclude }],
      order: [['id', 'ASC']],
    });
    res.json({
      songsList: entries
        .filter((e) => e.Song && (e.Song.audioPath || e.Song.source === 'audius'))
        .map((e) => serializeSong(e.Song)),
    });
  }),
);
router.post(
  '/:id/songs',
  asyncHandler(async (req, res) => {
    const song = await Song.findByPk(positiveId(req.body.songId));
    if (!song || (!song.audioPath && song.source !== 'audius'))
      throw httpError(404, 'Song not found in the catalog.');
    if (!(await require('../../services/catalog-references').allowedSong(song, req.user.id)))
      throw httpError(404, 'Song not found.');
    const [entry, created] = await PlaylistSong.findOrCreate({
      where: { playlistId: req.playlist.id, songId: song.id },
      defaults: { song: song.songName },
    });
    res.status(created ? 201 : 200).json({ songId: entry.songId });
  }),
);
router.delete(
  '/:id/songs/:songId',
  asyncHandler(async (req, res) => {
    await PlaylistSong.destroy({
      where: { playlistId: req.playlist.id, songId: positiveId(req.params.songId) },
    });
    res.status(204).end();
  }),
);
module.exports = router;
