const router = require('express').Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const settings = require('../controllers/settingsController');

router.use(protect, requireRole('admin', 'super_admin'));

router.post('/classes', settings.addClass);

router.post('/arms', settings.addArm);
router.put('/arms/:id', settings.updateArm);
router.delete('/arms/:id', settings.deleteArm);

router.post('/subjects', settings.addSubject);
router.put('/subjects/:id', settings.updateSubject);
router.delete('/subjects/:id', settings.deleteSubject);

module.exports = router;
