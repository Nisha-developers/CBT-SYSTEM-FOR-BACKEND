const router = require('express').Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const result = require('../controllers/resultController');

router.get('/mine', protect, requireRole('student'), result.myResults);

router.use(protect, requireRole('admin', 'super_admin', 'teacher'));
router.get('/', result.viewResults);
router.get('/past', result.pastResults);
router.post('/theory', result.recordTheoryMarks);
router.put('/:id/release', result.releaseResult);
router.put('/release-batch', result.releaseBatch);

module.exports = router;
