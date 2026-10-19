const router = require('express').Router();
const c = require('../controllers/exam.controller');
const V = require('../validations/exam.validation');
const { validate } = require('../middleware/validate.middleware');
const { asAdmin, asStudent } = require('../middleware/auth.middleware');
const { uploadLimiter } = require('../middleware/rateLimit.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');

// ---- student (declared before "/:id") ----
router.get('/available/:studentId', asAdmin, c.available);
router.put('/attempts/:attemptId/answer', asAdmin, validate({ params: V.attemptParams, body: V.answer }), c.saveAnswer);
router.post('/attempts/:attemptId/submit', asAdmin, validate({ params: V.attemptParams }), c.submit);
router.post('/:id/start/:studentId', asAdmin, validate({ params: V.examParams, body: V.start }), c.start);
router.get('/:id/:studentId', asStudent, validate({ params: V.examParams }), c.paper);   // the paper: answers never leave the server

// ---- admin ----
const byExam = { params: V.examParams };
router.get('/', asAdmin, validate({ query: V.list }), c.list);
router.post('/', asAdmin, validate({ body: V.create }), c.create);
router.get('/:id/admin', asAdmin, validate(byExam), c.getForAdmin);
router.put('/:id/open', asAdmin, validate({ ...byExam, body: V.open }), c.setOpen);
router.delete('/:id', asAdmin, validate(byExam), c.remove);
router.get('/:id/questions', asAdmin, validate(byExam), c.listQuestions);
router.post('/:id/questions', asAdmin, validate({ ...byExam, body: V.addQuestion }), c.addQuestion);
router.delete('/:id/questions/:questionId', asAdmin, validate({ params: V.questionParams }), c.removeQuestion);
router.post('/:id/questions/import', asAdmin, uploadLimiter, validate(byExam), uploadSingle, c.importPreview);
router.post('/:id/questions/import/confirm', asAdmin, validate({ ...byExam, body: V.confirmImport }), c.importConfirm);

module.exports = router;
