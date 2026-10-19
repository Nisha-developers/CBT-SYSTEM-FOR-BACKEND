const router = require('express').Router();
const c = require('../controllers/dashboard.controller');
const V = require('../validations/activity.validation');
const { validate } = require('../middleware/validate.middleware');
const { asAdmin } = require('../middleware/auth.middleware');

router.get('/', asAdmin, validate({ query: V.list }), c.activities);

module.exports = router;
