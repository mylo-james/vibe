const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { httpError } = require('./utils');
const { allowsWriteOrigin, trustProxy } = require('./config/hosting');
const app = express();
const portfolioOrigin = require('./config/portfolio-embed').portfolioEmbedOrigin();
app.disable('x-powered-by');
app.set('trust proxy', trustProxy());
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(
  helmet({
    // CSP supplies the exact parent allowlist when embedding is explicitly enabled.
    xFrameOptions: portfolioOrigin ? false : undefined,
    contentSecurityPolicy: {
      directives: {
        frameAncestors: ["'self'", ...(portfolioOrigin ? [portfolioOrigin] : [])],
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', ...require('./data/audius-origins.json')],
        fontSrc: ["'self'"],
        mediaSrc: ["'self'", ...require('./data/audius-origins.json')],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
  }),
);
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.get('Sec-Fetch-Site') === 'cross-site' || !allowsWriteOrigin(req))
      return next(httpError(403, 'Open Vibe directly to make changes.'));
  }
  next();
});
// Only the credited catalog is served. Historical recordings remain in Git history.
app.use('/public/test_music', (req, res, next) =>
  next(httpError(404, 'This recording is not in the current catalog.')),
);
app.use('/public', express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', require('./routes/backend-routes'));
app.use('/', require('./routes/frontend-routes'));
app.use((req, res, next) => next(httpError(404, 'That page or item could not be found.')));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status =
    err.name === 'SequelizeUniqueConstraintError'
      ? 409
      : err.name === 'SequelizeForeignKeyConstraintError'
        ? 400
        : err.status || 500;
  const message =
    status === 409
      ? 'That email, username, or playlist item already exists.'
      : status >= 500 && ![502, 503, 504].includes(status)
        ? 'Something went wrong. Please try again.'
        : err.message;
  if (status >= 500) console.error(err);
  if (!req.path.startsWith('/api/') && req.accepts(['html', 'json']) === 'html')
    return res.status(status).render('error', {
      title: status === 404 ? 'Page not found' : 'Unable to open this page',
      page: 'auth',
      message,
    });
  res.status(status).json({
    message,
    errors:
      err.errors && Array.isArray(err.errors) && typeof err.errors[0] === 'string'
        ? err.errors
        : [message],
  });
});
module.exports = app;
