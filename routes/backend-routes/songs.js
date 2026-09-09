const router = require('express').Router();
const { Song, Sequelize } = require('../../db/models');
const { requireAuth } = require('../../auth');
const { asyncHandler, positiveId, httpError } = require('../../utils');
const { songInclude, serializeSong } = require('../../services/catalog');
router.use(requireAuth);
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const songs = await Song.findAll({
      where: { audioPath: { [Sequelize.Op.ne]: null } },
      include: songInclude,
      order: [['id', 'ASC']],
    });
    res.json({ songsList: songs.map(serializeSong) });
  }),
);
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const song = await Song.findByPk(positiveId(req.params.id), { include: songInclude });
    if (!song || !song.audioPath) throw httpError(404, 'Song not found.');
    res.json({ songsList: [serializeSong(song)] });
  }),
);
module.exports = router;
