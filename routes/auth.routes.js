const router = require('express').Router();
const c = require('../controllers/auth.controller');
const V = require('../validations/auth.validation');
const { validate } = require('../middleware/validate.middleware');
const { asStudent, asAnyUser } = require('../middleware/auth.middleware');
const { loginLimiter, loginIpLimiter, signupLimiter, refreshLimiter } = require('../middleware/rateLimit.middleware');
const { requireTrustedOrigin } = require('../middleware/origin.middleware');

router.post('/admin/signup', signupLimiter, validate({ body: V.adminSignup }), c.adminSignup);
router.post('/admin/login', loginIpLimiter, loginLimiter, validate({ body: V.adminLogin }), c.adminLogin);
router.post('/student/login', loginIpLimiter, loginLimiter, validate({ body: V.studentLogin }), c.studentLogin);

// Cookie-based: only accepted from our own frontend origin
router.post('/refresh', requireTrustedOrigin, refreshLimiter, c.refresh);
router.post('/logout', requireTrustedOrigin, c.logout);

router.post('/logout-all', asAnyUser, c.logoutEverywhere);
router.post('/student/change-password', asStudent, validate({ body: V.changePassword }), c.changePassword);
router.get('/me', asAnyUser, c.me);

module.exports = router;
