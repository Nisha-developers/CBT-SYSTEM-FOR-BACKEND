const router = require('express').Router();
const { adminSignup, adminLogin, studentLogin } = require('../controllers/authController');

router.post('/admin/signup', adminSignup);
router.post('/admin/login', adminLogin);
router.post('/student/login', studentLogin);

module.exports = router;
