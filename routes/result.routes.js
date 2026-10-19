const router = require('express').Router();
const c = require('../controllers/result.controller');
const V = require('../validations/result.validation');
const { validate } = require('../middleware/validate.middleware');
const { asAdmin, asStudent } = require('../middleware/auth.middleware');

router.get('/mine', asStudent, c.mine);

router.get('/', asAdmin, validate({ query: V.view }), c.view);
router.put('/release', asAdmin, validate({ body: V.release }), c.release);
router.get('/theory/sheet', asAdmin, validate({ query: V.theorySheet }), c.theorySheet);
router.get('/theory/answers', asAdmin, validate({ query: V.theoryAnswers }), c.theoryAnswers);
router.post('/theory', asAdmin, validate({ body: V.recordTheory }), c.recordTheory);
router.get('/past', asAdmin, validate({ query: V.past }), c.past);
router.get('/review', asAdmin, validate({ query: V.getReview }), c.getReview);
router.post('/review', asAdmin, validate({ body: V.saveReview }), c.saveReview);

module.exports = router;
