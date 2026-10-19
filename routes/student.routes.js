const router = require('express').Router();
const c = require('../controllers/student.controller');
const V = require('../validations/student.validation');
const { idParam } = require('../validations/common');
const { validate } = require('../middleware/validate.middleware');
const { asAdmin } = require('../middleware/auth.middleware');

router.use(asAdmin);
router.get('/', validate({ query: V.list }), c.list);
router.post('/', validate({ body: V.create }), c.create);
router.get('/:id', validate({ params: idParam }), c.get);
router.put('/:id', validate({ params: idParam, body: V.update }), c.update);
router.delete('/:id', validate({ params: idParam }), c.remove);
router.post('/:id/reset-password', validate({ params: idParam }), c.resetPassword);

module.exports = router;
