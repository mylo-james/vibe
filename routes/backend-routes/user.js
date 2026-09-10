const router = require('express').Router();
const { body } = require('express-validator');
const { requireAuth } = require('../../auth');
const { Playlist, PlaylistSong, Song, sequelize } = require('../../db/models');
const { asyncHandler, httpError, positiveId, handleValidationErrors } = require('../../utils');
const {
  songInclude,
  playlistInclude,
  serializeSong,
  playlistSummary,
} = require('../../services/catalog');
const { createPlaylist } = require('../../services/demo-policy');
router.use(requireAuth);
router.param('id', (req, res, next, value) => {
  try {
    if (positiveId(value) !== req.user.id)
      throw httpError(403, 'You can only change or view your own account.');
    next();
  } catch (error) {
    next(error);
  }
});
router.get('/:id', (req, res) =>
  res.json({
    username: req.user.demoExpiresAt ? 'Demo listener' : req.user.userName,
    userId: req.user.id,
  }),
);
router.get(
  '/:id/playlists',
  asyncHandler(async (req, res) => {
    const playlists = await Playlist.findAll({
      where: { userId: req.user.id },
      include: playlistInclude,
      order: [['id', 'ASC']],
    });
    res.json({ playlistNames: playlists.map(playlistSummary) });
  }),
);
router.post(
  '/:id/playlists',
  body('playlistName')
    .isString()
    .bail()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Use a playlist name between 1 and 50 characters.'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const playlist = await createPlaylist({ Playlist, sequelize }, req.user, req.body.playlistName);
    res.status(201).json({ playlistId: playlist.id, playlist: playlist.playlistName });
  }),
);
router.get(
  '/:id/library',
  asyncHandler(async (req, res) => {
    const { SavedSong, SavedAlbum, Album } = require('../../db/models');
    const { serializeAlbum } = require('../../services/catalog');
    const songs = await SavedSong.findAll({
      where: { userId: req.user.id },
      include: [{ model: Song, include: songInclude }],
      order: [['id', 'DESC']],
    });
    const albums = await SavedAlbum.findAll({
      where: { userId: req.user.id },
      include: [Album],
      order: [['id', 'DESC']],
    });
    res.json({
      library: songs.map((e) => ({ ...serializeSong(e.Song), savedAt: e.createdAt })),
      albums: albums.map((e) => ({ ...serializeAlbum(e.Album), savedAt: e.createdAt })),
    });
  }),
);
for (const [kind, modelName, targetName, key] of [
  ['songs', 'SavedSong', 'Song', 'songId'],
  ['albums', 'SavedAlbum', 'Album', 'albumId'],
]) {
  router.put(
    `/:id/library/${kind}/:itemId`,
    asyncHandler(async (req, res) => {
      const models = require('../../db/models');
      const item = await models[targetName].findByPk(positiveId(req.params.itemId));
      if (!item || (kind === 'albums' && item.source !== 'audius'))
        throw httpError(404, 'Item not found.');
      const refs = require('../../services/catalog-references');
      if (
        !(await (kind === 'songs'
          ? refs.allowedSong(item, req.user.id)
          : refs.allowedAlbum(item, req.user.id)))
      )
        throw httpError(404, 'Item not found.');
      const [entry, created] = await models[modelName].findOrCreate({
        where: { userId: req.user.id, [key]: item.id },
      });
      res.status(created ? 201 : 200).json({ [key]: entry[key] });
    }),
  );
  router.delete(
    `/:id/library/${kind}/:itemId`,
    asyncHandler(async (req, res) => {
      const models = require('../../db/models');
      await models[modelName].destroy({
        where: { userId: req.user.id, [key]: positiveId(req.params.itemId) },
      });
      res.status(204).end();
    }),
  );
}
module.exports = router;
