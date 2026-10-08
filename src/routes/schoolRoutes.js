const router = require('express').Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const { setupSchool, getSchool, updateSchool, deleteSchool } = require('../controllers/schoolController');

router.post('/setup', setupSchool); // public — only works once (no school exists yet)
router.get('/', protect, getSchool);
router.put('/', protect, requireRole('admin', 'super_admin'), updateSchool);
router.delete('/', protect, requireRole('super_admin'), deleteSchool);

module.exports = router;
