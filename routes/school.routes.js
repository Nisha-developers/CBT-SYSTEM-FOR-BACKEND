const router = require('express').Router();
const c = require('../controllers/school.controller');
const V = require('../validations/school.validation');
const { idParam } = require('../validations/common');
const { validate } = require('../middleware/validate.middleware');
const { asAdmin, asSuperAdmin, asAnyUser } = require('../middleware/auth.middleware');
const { signupLimiter } = require('../middleware/rateLimit.middleware');

// public: homepage + first-time setup wizard
router.get('/exists', c.exists);
router.get('/public', c.publicInfo);
router.post('/setup', signupLimiter, validate({ body: V.setup }), c.setup);

// any logged-in user
router.get('/', asAnyUser, c.get);
router.get('/academic-terms', asAnyUser, c.academicTerms);

// admins
router.put('/', asAdmin, validate({ body: V.update }), c.update);
router.put('/academic-term', asAdmin, validate({ body: V.academicTerm }), c.setAcademicTerm);

const named = { params: idParam, body: V.rename };
router.patch('/classes/:id', asAdmin, validate(named), c.renameClass);
router.patch('/arms/:id', asAdmin, validate(named), c.renameArm);
router.patch('/subjects/:id', asAdmin, validate(named), c.renameSubject);
router.patch('/optional-subjects/:id', asAdmin, validate(named), c.renameOptional);

const byId = { params: idParam };
router.delete('/classes/:id', asAdmin, validate(byId), c.deleteClass);
router.delete('/arms/:id', asAdmin, validate(byId), c.deleteArm);
router.delete('/class-arms/:id', asAdmin, validate(byId), c.deleteClassArm);
router.delete('/subjects/:id', asAdmin, validate(byId), c.deleteSubject);
router.delete('/optional-subjects/:id', asAdmin, validate(byId), c.deleteOptional);

// destructive reset: super admin only
router.delete('/', asSuperAdmin, validate({ body: V.deleteSchool }), c.remove);

module.exports = router;
