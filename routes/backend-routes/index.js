const router = require('express').Router();
router.use('/', require('./userAuth'));
router.use('/users', require('./user'));
router.use('/playlists', require('./playlist'));
router.use('/catalog', require('./catalog'));
router.use('/songs', require('./songs'));
router.use('/search', require('./search'));
module.exports = router;
