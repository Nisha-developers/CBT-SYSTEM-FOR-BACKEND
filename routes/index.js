const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/school', require('./school.routes'));
router.use('/admins', require('./admin.routes'));
router.use('/students', require('./student.routes'));
router.use('/exams', require('./exam.routes'));
router.use('/results', require('./result.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/activities', require('./activity.routes'));

module.exports = router;
