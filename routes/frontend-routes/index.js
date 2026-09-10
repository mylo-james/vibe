const router = require('express').Router();
const catalog = require('../../data/catalog.json');
const { publicDemoEnabled } = require('../../config/public-demo');
router.get('/', (req, res) =>
  res.render('index', {
    title: 'Vibe',
    page: 'landing',
    script: 'index',
    publicDemo: publicDemoEnabled(),
  }),
);
router.get('/login', (req, res) => {
  if (publicDemoEnabled()) return res.redirect('/');
  res.render('login', { title: 'Log in | Vibe', page: 'auth', script: 'login' });
});
router.get('/signup', (req, res) => {
  if (publicDemoEnabled()) return res.redirect('/');
  res.render('signup', { title: 'Create account | Vibe', page: 'auth', script: 'signup' });
});
router.get('/credits', (req, res) =>
  res.render('credits', { title: 'Music credits | Vibe', page: 'credits', catalog }),
);
router.get(['/music', '/music/home', '/music/search'], (req, res) => {
  const q = typeof req.query.q === 'string' ? '?q=' + encodeURIComponent(req.query.q) : '';
  res.redirect('/music/discover' + q);
});
router.get(
  ['/music/discover', '/music/library', '/music/playlist/:id', '/music/album/:id'],
  (req, res) =>
    res.render('music', {
      title: 'Your music | Vibe',
      page: 'music',
      script: 'music',
      publicDemo: publicDemoEnabled(),
    }),
);
module.exports = router;
