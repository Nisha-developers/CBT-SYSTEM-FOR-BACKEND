const router = require('express').Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  listStudents,
  addStudent,
  getStudent,
  updateStudent,
  deleteStudent,
} = require('../controllers/studentController');

router.use(protect, requireRole('admin', 'super_admin', 'teacher'));
router.get('/', listStudents);
router.post('/', addStudent);
router.get('/:id', getStudent);
router.put('/:id', updateStudent);
router.delete('/:id', deleteStudent);

module.exports = router;
