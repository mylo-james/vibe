const jwt = require('jsonwebtoken');
const { jwtConfig } = require('./config');
const { User } = require('./db/models');
const { asyncHandler, httpError } = require('./utils');
const { cookieIsSecure } = require('./config/hosting');
const { publicDemoEnabled } = require('./config/public-demo');
const cookieName = 'vibe_session';
const cookieOptions = (req) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: cookieIsSecure(req),
  path: '/',
});
const getUserToken = (user) =>
  jwt.sign({ sub: String(user.id) }, jwtConfig.secret, {
    algorithm: 'HS256',
    expiresIn: user.demoExpiresAt ? '2h' : jwtConfig.expiresIn,
    issuer: 'vibe',
    audience: 'vibe-web',
  });
const setSession = (req, res, user) =>
  res.cookie(cookieName, getUserToken(user), {
    ...cookieOptions(req),
    maxAge: (user.demoExpiresAt ? 7200 : jwtConfig.expiresIn) * 1000,
  });
const clearSession = (req, res) => res.clearCookie(cookieName, cookieOptions(req));
const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[cookieName];
  if (!token) throw httpError(401, 'Please log in to continue.');
  let payload;
  try {
    payload = jwt.verify(token, jwtConfig.secret, {
      algorithms: ['HS256'],
      issuer: 'vibe',
      audience: 'vibe-web',
    });
  } catch {
    clearSession(req, res);
    throw httpError(401, 'Your session expired. Please log in again.');
  }
  if (!/^\d+$/.test(payload.sub)) throw httpError(401, 'Please log in again.');
  req.user = await User.findByPk(Number(payload.sub));
  if (
    !req.user ||
    (req.user.demoExpiresAt && new Date(req.user.demoExpiresAt) <= new Date()) ||
    (publicDemoEnabled() && !req.user.demoExpiresAt)
  ) {
    clearSession(req, res);
    throw httpError(401, 'Your session expired. Please log in again.');
  }
  next();
});
module.exports = {
  requireAuth,
  getUserToken,
  setSession,
  clearSession,
  cookieOptions,
};
