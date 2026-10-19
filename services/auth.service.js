const { hashPassword, comparePassword, compareDummy } = require('../utils/hash');
const { newUid } = require('../utils/uid');
const { unauthorized, forbidden, conflict, notFound, badRequest } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const adminModel = require('../models/admin.model');
const studentModel = require('../models/student.model');
const schoolModel = require('../models/school.model');
const tokenService = require('./token.service');
const activityService = require('./activity.service');
const { ROLES } = require('../constants');

// ---------- public shapes (never include hashes) ----------
const publicAdmin = (a) => ({ id: a.uid, fullName: a.full_name, username: a.username, email: a.email, role: a.role });

const publicStudent = (s) => ({
  id: s.uid,
  role: ROLES.STUDENT,
  studentId: s.student_id,
  admissionNumber: s.student_id,
  firstName: s.first_name,
  lastName: s.last_name,
  fullName: `${s.first_name} ${s.last_name}`,
  gender: s.gender,
  class: s.class_name,
  arm: s.arm_name,
  classArmId: s.class_arm_uid,
  fullClassName: s.full_class_name,
  mustChangePassword: !s.password_changed,
});

const adminSubject = (a) => ({ type: 'admin', id: a.id, uid: a.uid, role: a.role });
const studentSubject = (s) => ({ type: 'student', id: s.id, uid: s.uid, role: ROLES.STUDENT });

const BAD_LOGIN = 'Invalid credentials.';

// ---------- admin ----------
// Only possible once the school exists and before any admin does; that account is the super admin.
async function adminSignup({ fullName, email, username, password }, meta) {
  if (!(await schoolModel.findSchool())) throw conflict('Set up your school first before creating an admin account.');
  if (await adminModel.exists()) throw forbidden('An admin account already exists. Please log in.');

  const passwordHash = await hashPassword(password);
  const uid = newUid();
  try {
    await withTransaction(async (conn) => {
      const adminId = await adminModel.insert({ uid, fullName, username, email, passwordHash, role: ROLES.SUPER_ADMIN }, conn);
      await activityService.log({ adminId, type: 'admin', activity: `${fullName} created the super admin account`, conn });
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('That email or username is already taken.');
    throw err;
  }

  const admin = await adminModel.findByUid(uid);
  const tokens = await tokenService.createSession(adminSubject(admin), meta);
  return { ...tokens, user: publicAdmin(admin) };
}

async function adminLogin({ emailOrUsername, password }, meta) {
  const admin = await adminModel.findForLogin(emailOrUsername.toLowerCase());
  // Same error + same work whether the account exists or not.
  const valid = admin ? await comparePassword(password, admin.password_hash) : await compareDummy(password);
  if (!admin || !valid) throw unauthorized(BAD_LOGIN);
  if (admin.status !== 'active') throw forbidden('This account has been deactivated. Contact a super admin.');

  await adminModel.touchLastLogin(admin.id);
  const tokens = await tokenService.createSession(adminSubject(admin), meta);
  return { ...tokens, user: publicAdmin(admin) };
}

// ---------- student ----------
// Until they pick their own password, a student's password is their last name (any case).
async function studentLogin({ admissionNumber, password }, meta) {
  const student = await studentModel.findForLogin(admissionNumber);
  let valid;
  if (student) {
    const attempt = student.password_changed ? password : password.trim().toLowerCase();
    valid = await comparePassword(attempt, student.password_hash);
  } else {
    valid = await compareDummy(password);
  }
  if (!student || !valid) throw unauthorized(BAD_LOGIN);

  const tokens = await tokenService.createSession(studentSubject(student), meta);
  return { ...tokens, user: publicStudent(student) };
}

async function changeStudentPassword(user, { currentPassword, newPassword }) {
  const student = await studentModel.findCredentials(user.id);
  if (!student) throw notFound('Student not found');
  const attempt = student.password_changed ? currentPassword : currentPassword.trim().toLowerCase();
  if (!(await comparePassword(attempt, student.password_hash))) throw badRequest('Your current password is incorrect.');

  await studentModel.updatePassword(user.id, await hashPassword(newPassword), true);
  await tokenService.revokeAllForSubject('student', user.id, user.familyId);   // sign out other devices, keep this one
}

// ---------- session ----------
async function profileOf(subject) {
  if (subject.type === 'student') {
    const s = await studentModel.findById(subject.id);
    if (!s) throw unauthorized('Account no longer exists');
    return publicStudent(s);
  }
  const a = await adminModel.findByUid(subject.uid);
  if (!a || a.status !== 'active') throw unauthorized('Account no longer active');
  return publicAdmin(a);
}

async function refresh(refreshToken, meta) {
  if (!refreshToken) throw unauthorized('Session expired. Please log in again.');
  const { accessToken, refreshToken: nextToken, subject } = await tokenService.rotate(refreshToken, meta);
  return { accessToken, refreshToken: nextToken, user: await profileOf(subject) };
}

async function logout(refreshToken) {
  if (refreshToken) await tokenService.revokeByToken(refreshToken);
}

const logoutEverywhere = (user) => tokenService.revokeAllForSubject(user.type, user.id, null);

const me = (user) => profileOf(user);

module.exports = {
  adminSignup, adminLogin, studentLogin, changeStudentPassword, refresh, logout, logoutEverywhere, me,
  publicStudent,
};
