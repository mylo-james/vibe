const router = require('express').Router();
const { query } = require('express-validator');
const { Song, Playlist, Sequelize } = require('../../db/models');
const { requireAuth } = require('../../auth');
const { asyncHandler, handleValidationErrors } = require('../../utils');
const { songInclude, serializeSong, playlistSummary } = require('../../services/catalog');
router.use(requireAuth);
router.get(
  '/',
  query('searchInput')
    .isString()
    .bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search with up to 100 characters.'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // Literal matching prevents user input from becoming regex syntax. This bounded demo catalog is small.
    const terms = req.query.searchInput.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (text) => terms.every((term) => text.toLowerCase().includes(term));
    const songs = (
      await Song.findAll({
        where: { audioPath: { [Sequelize.Op.ne]: null } },
        include: songInclude,
        order: [['id', 'ASC']],
      })
    ).map(serializeSong);
    const playlists = await Playlist.findAll({
      where: { userId: req.user.id },
      order: [['id', 'ASC']],
    });
    res.json({
      songsList: songs.filter((s) =>
        match([s.songName, s.artistName, s.collectionName, s.style].filter(Boolean).join(' ')),
      ),
      playlistNames: playlists.filter((p) => match(p.playlistName)).map(playlistSummary),
    });
  }),
);
module.exports = router;
