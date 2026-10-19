const { hashPassword } = require('../utils/hash');
const { newUid } = require('../utils/uid');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const studentModel = require('../models/student.model');
const schoolModel = require('../models/school.model');
const activityService = require('./activity.service');
const tokenService = require('./token.service');

const defaultPassword = (lastName) => lastName.trim().toLowerCase();

const shape = (s, optionalSubjects = []) => ({
  id: s.uid,
  firstName: s.first_name,
  lastName: s.last_name,
  uniqueId: s.student_id,
  studentId: s.student_id,
  gender: s.gender,
  class: s.class_name,
  arm: s.arm_name,
  classArmId: s.class_arm_uid,
  fullClassName: s.full_class_name,
  optionalSubjects,
  createdAt: s.created_at,
});

async function withOptional(rows) {
  const optional = await studentModel.optionalSubjectsOf(rows.map((r) => r.id));
  const byStudent = {};
  optional.forEach((o) => (byStudent[o.student_id] ||= []).push({ id: o.uid, name: o.subject_name }));
  return rows.map((r) => shape(r, byStudent[r.id] || []));
}

async function list(query) {
  const { page, limit, ...filters } = query;
  const filter = {
    classArmUid: filters.classArmId, classUid: filters.classId, armUid: filters.armId,
    className: filters.class, armName: filters.arm, search: filters.search,
  };
  const [rows, total] = await Promise.all([
    studentModel.list(filter, limit, (page - 1) * limit),
    studentModel.count(filter),
  ]);
  return { students: await withOptional(rows), total, page, pages: Math.max(1, Math.ceil(total / limit)), limit };
}

async function getOne(uid) {
  const row = await studentModel.findByUid(uid);
  if (!row) throw notFound('Student not found');
  return (await withOptional([row]))[0];
}

async function resolveClassArm(uid, conn) {
  const ca = await schoolModel.findClassArmByUid(uid, conn);
  if (!ca) throw badRequest('That class/arm does not exist.');
  return ca;
}

async function resolveOptional(classArmId, uids, conn) {
  const unique = [...new Set(uids)];
  const ids = await studentModel.resolveOptionalIds(classArmId, unique, conn);
  if (ids.length !== unique.length) throw badRequest('One or more optional subjects are not offered in that class.');
  return ids;
}

async function create(body, actor) {
  const passwordHash = await hashPassword(defaultPassword(body.lastName));
  const uid = newUid();
  try {
    await withTransaction(async (conn) => {
      const classArm = await resolveClassArm(body.classArmId, conn);
      const optionalIds = await resolveOptional(classArm.class_arm_id, body.optionalSubjectIds, conn);
      const id = await studentModel.insert({
        uid, studentId: body.studentId, firstName: body.firstName, lastName: body.lastName,
        gender: body.gender || null, classArmId: classArm.class_arm_id, passwordHash,
      }, conn);
      await studentModel.replaceOptionalSubjects(id, optionalIds, conn);
      await activityService.log({
        adminId: actor.id, type: 'student',
        activity: `Added student ${body.firstName} ${body.lastName} to ${classArm.full_class_name}`, conn,
      });
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict(`A student with ID "${body.studentId}" already exists.`);
    throw err;
  }
  return getOne(uid);
}

async function update(uid, body, actor) {
  try {
    await withTransaction(async (conn) => {
      const current = await studentModel.findBasicByUid(uid, conn, { lock: true });
      if (!current) throw notFound('Student not found');

      const classArmId = body.classArmId ? (await resolveClassArm(body.classArmId, conn)).class_arm_id : current.class_arm_id;
      await studentModel.update(current.id, {
        studentId: body.studentId ?? current.student_id,
        firstName: body.firstName ?? current.first_name,
        lastName: body.lastName ?? current.last_name,
        gender: body.gender === undefined ? current.gender : body.gender,
        classArmId,
      }, conn);

      if (body.optionalSubjectIds) {
        await studentModel.replaceOptionalSubjects(current.id, await resolveOptional(classArmId, body.optionalSubjectIds, conn), conn);
      } else if (classArmId !== current.class_arm_id) {
        await studentModel.replaceOptionalSubjects(current.id, [], conn);   // old choices belonged to the old class
      }
      await activityService.log({
        adminId: actor.id, type: 'student',
        activity: `Updated student ${body.firstName ?? current.first_name} ${body.lastName ?? current.last_name}`, conn,
      });
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('That student ID is already used by another student.');
    throw err;
  }
  return getOne(uid);
}

async function remove(uid, actor) {
  const student = await studentModel.findBasicByUid(uid);
  if (!student) throw notFound('Student not found');
  await studentModel.remove(student.id);
  await tokenService.revokeAllForSubject('student', student.id, null);
  await activityService.log({ adminId: actor.id, type: 'student', activity: `Removed student ${student.first_name} ${student.last_name}` });
}

async function resetPassword(uid, actor) {
  const student = await studentModel.findBasicByUid(uid);
  if (!student) throw notFound('Student not found');
  await studentModel.updatePassword(student.id, await hashPassword(defaultPassword(student.last_name)), false);
  await tokenService.revokeAllForSubject('student', student.id, null);
  await activityService.log({ adminId: actor.id, type: 'student', activity: `Reset password for ${student.first_name} ${student.last_name}` });
}

module.exports = { list, getOne, create, update, remove, resetPassword };
