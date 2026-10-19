const { verifyAccessToken } = require('../utils/jwt');
const { HttpError, unauthorized, forbidden } = require('../utils/errors');
const adminModel = require('../models/admin.model');
const studentModel = require('../models/student.model');
const { ROLES } = require('../constants');

// 1. Verify the short-lived access token (Authorization: Bearer ...).
// 2. Re-check the account in the database, so a deactivated / deleted / demoted user loses access
//    immediately instead of when the token happens to expire.
const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next(unauthorized('Access token required'));

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return next(new HttpError(401, expired ? 'Access token expired' : 'Invalid access token', { code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' }));
  }
  const studentId = req.params.studentId;
  
  if(payload.type === 'admin' && studentId){
    const studentExam = await studentModel.findAuthByStudentId(studentId);
    
    req.user = { id: studentExam.id, uid: studentExam.uid, type: 'admin', role: ROLES.ADMIN, classArmId: studentExam.class_arm_id};
    
  }
  else if (payload.type === 'admin') {
    const admin = await adminModel.findAuthByUid(payload.sub);
    if (!admin || admin.status !== 'active') return next(unauthorized('This account is no longer active'));
    req.user = { id: admin.id, uid: admin.uid, type: 'admin', role: admin.role, familyId: payload.fid };
  }  
  else if (payload.type === 'student') {
  
    const student = await studentModel.findAuthByUid(payload.sub);
    if (!student) return next(unauthorized('This account no longer exists'));
    req.user = { id: student.id, uid: student.uid, type: 'student', role: ROLES.STUDENT, classArmId: student.class_arm_id, familyId: payload.fid };
  } else {
    return next(unauthorized('Invalid access token'));
  }
  return next();
};

const requireRoles = (...roles) => (req, res, next) =>{
 
  (roles.includes(req.user?.role) ? next() : next(forbidden()))};

const asAdmin = [authenticate, requireRoles(ROLES.ADMIN, ROLES.SUPER_ADMIN)];
const asSuperAdmin = [authenticate, requireRoles(ROLES.SUPER_ADMIN)];
const asStudent = [authenticate, requireRoles(ROLES.STUDENT)];
const asAnyUser = [authenticate];

module.exports = { authenticate, requireRoles, asAdmin, asSuperAdmin, asStudent, asAnyUser };
