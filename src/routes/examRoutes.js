const router = require('express').Router();
const multer = require('multer');
const { protect, requireRole } = require('../middleware/authMiddleware');
const exam = require('../controllers/examController');
const question = require('../controllers/questionController');

const upload = multer({ dest: 'uploads/' });

// Student-side routes (declared before the admin-only gate below)
router.get('/available', protect, requireRole('student'), exam.availableExams);
router.post('/:id/start', protect, requireRole('student'), exam.startAttempt);
router.put('/attempts/:attemptId/answer', protect, requireRole('student'), exam.saveAnswer);
router.post('/attempts/:attemptId/submit', protect, requireRole('student'), exam.submitAttempt);

// Admin/teacher routes
router.use(protect, requireRole('admin', 'super_admin', 'teacher'));
router.get('/', exam.listExams);
router.post('/', exam.createExam);
router.get('/:id', exam.getExam);
router.put('/:id/publish', exam.publishExam);
router.post('/:id/questions', exam.addQuestion);
router.post('/:id/questions/import', upload.single('file'), question.importQuestions);
router.post('/:id/questions/import/confirm', question.confirmImportedQuestions);

module.exports = router;
