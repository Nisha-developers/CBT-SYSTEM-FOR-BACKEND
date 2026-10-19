const router = require('express').Router();
const c = require('../controllers/admin.controller');
const V = require('../validations/auth.validation');
const { validate } = require('../middleware/validate.middleware');
const { asSuperAdmin } = require('../middleware/auth.middleware');

router.use(asSuperAdmin);
router.get('/', c.list);
router.post('/', validate({ body: V.adminCreate }), c.create);
router.put('/:id', validate({ params: V.adminParams, body: V.adminUpdate }), c.update);
router.delete('/:id', validate({ params: V.adminParams }), c.remove);

module.exports = router;
