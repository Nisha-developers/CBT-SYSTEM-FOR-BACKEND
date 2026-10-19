const router = require('express').Router();
const c = require('../controllers/dashboard.controller');
const { asAdmin } = require('../middleware/auth.middleware');

router.get('/overview', asAdmin, c.overview);

module.exports = router;
