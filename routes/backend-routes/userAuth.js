const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const { body } = require('express-validator');
const { rateLimit } = require('express-rate-limit');
const {
  User,
  Playlist,
  PlaylistSong,
  Song,
  SavedSong,
  SavedAlbum,
  sequelize,
  Sequelize,
} = require('../../db/models');
const { asyncHandler, httpError, handleValidationErrors } = require('../../utils');
const { requireAuth, setSession, clearSession } = require('../../auth');
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Too many attempts. Try again in 15 minutes.',
    errors: ['Too many attempts. Try again in 15 minutes.'],
  },
});
const email = body('email')
  .isString()
  .bail()
  .trim()
  .isEmail()
  .isLength({ max: 100 })
  .withMessage('Enter a valid email address.')
  .toLowerCase();
const publicUser = (user) => ({
  userId: user.id,
  username: user.demoExpiresAt ? 'Demo listener' : user.userName,
  demo: Boolean(user.demoExpiresAt),
});
router.get('/session', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
router.post('/logout', (req, res) => {
  clearSession(req, res);
  res.status(204).end();
});
router.post(
  '/login',
  authLimit,
  email,
  body('password').isString().isLength({ min: 1, max: 200 }).withMessage('Enter your password.'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ where: { email: req.body.email } });
    const valid =
      user &&
      !user.demoExpiresAt &&
      (await bcrypt.compare(req.body.password, user.hashedPassword.toString()));
    if (!valid) throw httpError(401, 'Email or password is incorrect.');
    setSession(req, res, user);
    res.json({ user: publicUser(user) });
  }),
);
router.post(
  '/sign-up',
  authLimit,
  email,
  body('confirmEmail')
    .isString()
    .bail()
    .trim()
    .toLowerCase()
    .custom((value, { req }) => value === req.body.email)
    .withMessage('Email addresses must match.'),
  body('userName')
    .isString()
    .bail()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Use a username between 1 and 20 characters.'),
  body('password')
    .isString()
    .bail()
    .isLength({ min: 12 })
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Use a password of at least 12 characters and no more than 72 bytes.'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords must match.'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const user = await User.create({
      email: req.body.email,
      userName: req.body.userName,
      hashedPassword: await bcrypt.hash(req.body.password, 12),
    });
    setSession(req, res, user);
    res.status(201).json({ user: publicUser(user) });
  }),
);
router.post(
  '/demo',
  authLimit,
  asyncHandler(async (req, res) => {
    const user = await sequelize.transaction(async (transaction) => {
      // Expired demo accounts are owned disposable data; registered accounts never match.
      const expired = await User.findAll({
        where: { demoExpiresAt: { [Sequelize.Op.lt]: new Date() } },
        attributes: ['id'],
        transaction,
      });
      const ids = expired.map((user) => user.id);
      if (ids.length) {
        const playlists = await Playlist.findAll({
          where: { userId: ids },
          attributes: ['id'],
          transaction,
        });
        await PlaylistSong.destroy({
          where: { playlistId: playlists.map((p) => p.id) },
          transaction,
        });
        await Playlist.destroy({ where: { userId: ids }, transaction });
        await SavedSong.destroy({ where: { userId: ids }, transaction });
        await SavedAlbum.destroy({ where: { userId: ids }, transaction });
        await User.destroy({ where: { id: ids }, transaction });
      }
      const id = randomBytes(8).toString('hex');
      const user = await User.create(
        {
          email: `demo-${id}@vibe.invalid`,
          userName: `demo${id}`,
          hashedPassword: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
          demoExpiresAt: new Date(Date.now() + 7200000),
        },
        { transaction },
      );
      const songs = await Song.findAll({
        where: { audioPath: { [Sequelize.Op.ne]: null } },
        order: [['id', 'ASC']],
        transaction,
      });
      for (const [name, style] of [
        ['Late-night focus', 'Chill'],
        ['Press start', 'Chiptune'],
        ['Electronic drift', 'Electronic'],
      ]) {
        const playlist = await Playlist.create(
          { playlistName: name, userId: user.id },
          { transaction },
        );
        await PlaylistSong.bulkCreate(
          songs
            .filter((song) => song.style === style)
            .map((song) => ({ song: song.songName, songId: song.id, playlistId: playlist.id })),
          { transaction },
        );
      }
      return user;
    });
    setSession(req, res, user);
    res.status(201).json({ user: publicUser(user) });
  }),
);
module.exports = router;
