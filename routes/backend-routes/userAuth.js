const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { rateLimit } = require('express-rate-limit');
const models = require('../../db/models');
const { User } = models;
const { asyncHandler, httpError, handleValidationErrors } = require('../../utils');
const { requireAuth, setSession, clearSession } = require('../../auth');
const { publicDemoEnabled } = require('../../config/public-demo');
const {
  CRON_PATH,
  admitDemo,
  cleanupPublicDemos,
  cronAuthorized,
} = require('../../services/demo-policy');
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
const rejectDurableAuth = (req, res, next) => {
  if (publicDemoEnabled())
    throw httpError(404, 'This public preview starts a temporary demo only.');
  next();
};
router.get('/session', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
router.post('/logout', (req, res) => {
  clearSession(req, res);
  res.status(204).end();
});
router.post(
  '/login',
  rejectDurableAuth,
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
  rejectDurableAuth,
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
    const user = await admitDemo(models);
    setSession(req, res, user);
    res.status(201).json({ user: publicUser(user) });
  }),
);
router.get(
  CRON_PATH,
  asyncHandler(async (req, res) => {
    if (!cronAuthorized(req)) throw httpError(404, 'That page or item could not be found.');
    res.json({ removed: await cleanupPublicDemos(models) });
  }),
);
module.exports = router;
