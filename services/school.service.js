const M = require('../models/school.model');
const adminModel = require('../models/admin.model');
const activityService = require('./activity.service');
const termService = require('./term.service');
const { withTransaction } = require('../utils/transaction');
const { badRequest, forbidden, notFound, conflict, unprocessable } = require('../utils/errors');
const { ROLES } = require('../constants');

const logSchool = (conn, actor, activity) => activityService.log({ adminId: actor?.id, type: 'school', activity, conn });

// ---------- public ----------
async function status() {
  const [school, hasAdmin] = await Promise.all([M.findSchool(), adminModel.exists()]);
  return { exists: !!school, hasAdmin, schoolName: school?.name || null };
}

async function publicInfo() {
  const s = await M.findSchool();
  return s ? { name: s.name, motto: s.motto, logo: s.logo, headline: s.headline, description: s.description } : null;
}

// ---------- create (setup wizard) ----------
async function createSetup(payload) {
  if (await M.findSchool()) throw conflict('A school already exists. Only one school is allowed.');

  return withTransaction(async (conn) => {
    const schoolId = await M.insertSchool(payload.school, conn);

    const classIds = {};
    for (const name of payload.classes) classIds[name] = await M.insertClass(name, conn);
    const armIds = {};
    for (const name of payload.arms) armIds[name] = await M.insertArm(name, conn);

    const classArmIds = {};
    for (const ca of payload.classArms) {
      classArmIds[ca.full_class_name] = await M.insertClassArm({
        armId: armIds[ca.arm_name], classId: classIds[ca.class_name], fullClassName: ca.full_class_name,
      }, conn);
    }

    for (const [kind, list] of [['compulsory', payload.subjects], ['optional', payload.optionalSubjects]]) {
      for (const subject of list) {
        const subjectId = await M.insertSubject(kind, subject.subject_name, conn);
        for (const full of subject.class_arms) await M.linkSubject(kind, subjectId, classArmIds[full], conn);
      }
    }

    const d = termService.defaultSessionAndTerm();
    await termService.setCurrentTerm(payload.session || d.session, payload.term || d.term, conn);
    return { school_id: schoolId };
  });
}

// ---------- read: every record is identified by its uid ----------
async function getSetup() {
  const school = await M.findSchool();
  if (!school) throw notFound('School has not been set up yet.');

  const [classes, arms, classArms, subjects, subjectLinks, optional, optionalLinks, perClass, perArm, term] = await Promise.all([
    M.findAllClasses(), M.findAllArms(), M.findAllClassArms(),
    M.findAllSubjects('compulsory'), M.findAllSubjectLinks('compulsory'),
    M.findAllSubjects('optional'), M.findAllSubjectLinks('optional'),
    M.countStudentsByClass(), M.countStudentsByClassArm(), termService.getCurrentTerm(),
  ]);

  const caUid = Object.fromEntries(classArms.map((c) => [c.class_arm_id, c.uid]));
  const classCount = Object.fromEntries(perClass.map((r) => [r.class_id, r.c]));
  const armCount = Object.fromEntries(perArm.map((r) => [r.class_arm_id, r.c]));
  const withLinks = (list, links) => list.map((s) => ({
    id: s.uid, name: s.subject_name,
    classArmIds: links.filter((l) => l.subject_id === s.id).map((l) => caUid[l.class_arm_id]).filter(Boolean),
  }));

  return {
    school: {
      name: school.name, phone: school.phone, email: school.email, motto: school.motto, logo: school.logo,
      description: school.description, headline: school.headline, address: school.address,
    },
    classes: classes.map((c) => ({ id: c.uid, name: c.class_name, students: classCount[c.class_id] || 0 })),
    arms: arms.map((a) => ({ id: a.uid, name: a.arm_name })),
    classArms: classArms.map((ca) => ({
      id: ca.uid, fullName: ca.full_class_name, classId: ca.class_uid, className: ca.class_name,
      armId: ca.arm_uid, armName: ca.arm_name, students: armCount[ca.class_arm_id] || 0,
    })),
    subjects: withLinks(subjects, subjectLinks),
    optionalSubjects: withLinks(optional, optionalLinks),
    term,
  };
}

// ---------- update (add / relink), name based and partial ----------
async function updateSetup(payload, actor) {
  return withTransaction(async (conn) => {
    const changes = [];
    const existing = await M.findSchool(conn);
    if (!existing) throw notFound('School has not been set up yet.');

    if (payload.school) {
      const merged = {};
      for (const k of ['name', 'phone', 'email', 'motto', 'logo', 'description', 'headline', 'address']) {
        merged[k] = payload.school[k] !== undefined ? payload.school[k] : existing[k];
      }
      await M.updateSchool(existing.id, merged, conn);
      changes.push('school profile');
    }

    for (const name of payload.classes || []) {
      if (!(await M.findClassByName(name, conn))) { await M.insertClass(name, conn); changes.push(`added class "${name}"`); }
    }
    for (const name of payload.arms || []) {
      if (!(await M.findArmByName(name, conn))) { await M.insertArm(name, conn); changes.push(`added arm "${name}"`); }
    }

    for (const ca of payload.classArms || []) {
      if (await M.findClassArmByFullName(ca.full_class_name, conn)) continue;
      const cls = await M.findClassByName(ca.class_name, conn);
      const arm = await M.findArmByName(ca.arm_name, conn);
      if (!cls) throw unprocessable(`Unknown class "${ca.class_name}"`);
      if (!arm) throw unprocessable(`Unknown arm "${ca.arm_name}"`);
      await M.insertClassArm({ armId: arm.arm_id, classId: cls.class_id, fullClassName: ca.full_class_name }, conn);
      changes.push(`added class arm "${ca.full_class_name}"`);
    }

    const classArmIds = Object.fromEntries((await M.findAllClassArms(conn)).map((r) => [r.full_class_name, r.class_arm_id]));
    for (const [kind, list] of [['compulsory', payload.subjects || []], ['optional', payload.optionalSubjects || []]]) {
      const label = kind === 'optional' ? 'optional subject' : 'subject';
      for (const subject of list) {
        const found = await M.findSubjectByName(kind, subject.subject_name, conn);
        let id;
        if (found) { id = found.id; await M.clearSubjectLinks(kind, id, conn); changes.push(`updated ${label} "${subject.subject_name}"`); }
        else { id = await M.insertSubject(kind, subject.subject_name, conn); changes.push(`added ${label} "${subject.subject_name}"`); }
        for (const full of subject.class_arms) {
          if (!classArmIds[full]) throw unprocessable(`Unknown class arm "${full}"`);
          await M.linkSubject(kind, id, classArmIds[full], conn);
        }
      }
    }

    if (changes.length) await logSchool(conn, actor, `Edited school information: ${changes.join(', ')}`);
    return { changes };
  });
}

// ---------- delete (by uid, blocked while still in use) ----------
const blockedBy = (what, name, parts) => conflict(`Cannot delete ${what} "${name}": referenced by ${parts.join(', ')}.`);

async function deleteClass(uid, actor) {
  return withTransaction(async (conn) => {
    const cls = await M.findClassByUid(uid, conn);
    if (!cls) throw notFound('Class not found');
    const inUse = await M.countClassArmsByClass(cls.class_id, conn);
    if (inUse) throw blockedBy('class', cls.class_name, [`${inUse} class arm(s)`]);
    await M.deleteClass(cls.class_id, conn);
    await logSchool(conn, actor, `Deleted class "${cls.class_name}"`);
    return { deleted: { id: uid, name: cls.class_name } };
  });
}

async function deleteArm(uid, actor) {
  return withTransaction(async (conn) => {
    const arm = await M.findArmByUid(uid, conn);
    if (!arm) throw notFound('Arm not found');
    const inUse = await M.countClassArmsByArm(arm.arm_id, conn);
    if (inUse) throw blockedBy('arm', arm.arm_name, [`${inUse} class arm(s)`]);
    await M.deleteArm(arm.arm_id, conn);
    await logSchool(conn, actor, `Deleted arm "${arm.arm_name}"`);
    return { deleted: { id: uid, name: arm.arm_name } };
  });
}

async function deleteClassArm(uid, actor) {
  return withTransaction(async (conn) => {
    const ca = await M.findClassArmByUid(uid, conn);
    if (!ca) throw notFound('Class arm not found');
    const [students, obj, theory] = await Promise.all([
      M.countStudentsInClassArm(ca.class_arm_id, conn),
      M.countExamConfigsInClassArm('exam_config_obj', ca.class_arm_id, conn),
      M.countExamConfigsInClassArm('exam_config_theory', ca.class_arm_id, conn),
    ]);
    const parts = [];
    if (students) parts.push(`${students} student(s)`);
    if (obj) parts.push(`${obj} objective exam config(s)`);
    if (theory) parts.push(`${theory} theory exam config(s)`);
    if (parts.length) throw blockedBy('class arm', ca.full_class_name, parts);
    await M.deleteClassArm(ca.class_arm_id, conn);
    await logSchool(conn, actor, `Deleted class arm "${ca.full_class_name}"`);
    return { deleted: { id: uid, name: ca.full_class_name } };
  });
}

async function deleteSubject(kind, uid, actor) {
  return withTransaction(async (conn) => {
    const subject = await M.findSubjectByUid(kind, uid, conn);
    if (!subject) throw notFound(`${kind === 'optional' ? 'Optional subject' : 'Subject'} not found`);
    const [objQ, theoryQ, exams, students] = await Promise.all([
      M.countQuestionsOfSubject('obj_questions', subject.id, kind, conn),
      M.countQuestionsOfSubject('theory_questions', subject.id, kind, conn),
      M.countExamConfigsOfSubject(subject.id, kind, conn),
      kind === 'optional' ? M.countStudentsUsingOptional(subject.id, conn) : 0,
    ]);
    const parts = [];
    if (objQ) parts.push(`${objQ} objective question(s)`);
    if (theoryQ) parts.push(`${theoryQ} theory question(s)`);
    if (exams) parts.push(`${exams} exam config(s)`);
    if (students) parts.push(`${students} student(s)`);
    if (parts.length) throw blockedBy('subject', subject.subject_name, parts);
    await M.deleteSubject(kind, subject.id, conn);
    await logSchool(conn, actor, `Deleted ${kind === 'optional' ? 'optional ' : ''}subject "${subject.subject_name}"`);
    return { deleted: { id: uid, name: subject.subject_name } };
  });
}

// ---------- rename (by uid) ----------
const RENAMERS = {
  class: { label: 'Class', field: 'class_name', find: M.findClassByUid, idOf: (r) => r.class_id, apply: M.renameClass },
  arm: { label: 'Arm', field: 'arm_name', find: M.findArmByUid, idOf: (r) => r.arm_id, apply: M.renameArm },
  subject: { label: 'Subject', field: 'subject_name', find: (u, c) => M.findSubjectByUid('compulsory', u, c), idOf: (r) => r.id, apply: (id, n, c) => M.renameSubject('compulsory', id, n, c) },
  optional: { label: 'Optional subject', field: 'subject_name', find: (u, c) => M.findSubjectByUid('optional', u, c), idOf: (r) => r.id, apply: (id, n, c) => M.renameSubject('optional', id, n, c) },
};

async function rename(what, uid, name, actor) {
  const r = RENAMERS[what];
  try {
    return await withTransaction(async (conn) => {
      const row = await r.find(uid, conn);
      if (!row) throw notFound(`${r.label} not found`);
      if (row[r.field] !== name) {
        await r.apply(r.idOf(row), name, conn);
        await logSchool(conn, actor, `Renamed ${r.label.toLowerCase()} "${row[r.field]}" to "${name}"`);
      }
      return { renamed: { id: uid, name } };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict(`A ${r.label.toLowerCase()} named "${name}" already exists`);
    throw err;
  }
}

// ---------- current term / delete school ----------
async function setAcademicTerm({ session, term }, actor) {
  await withTransaction(async (conn) => {
    await termService.setCurrentTerm(session, term, conn);
    await logSchool(conn, actor, `Set current term to ${term}, ${session}`);
  });
  return termService.getCurrentTerm();
}

// Wipes everything, sessions included. Super admin only, and the caller must type DELETE.
async function deleteSchool(confirm, actor) {
  if (actor.role !== ROLES.SUPER_ADMIN) throw forbidden('Only a super admin can delete the school');
  if (confirm !== 'DELETE') throw badRequest('Type DELETE to confirm');
  await M.truncateEverything();
}

module.exports = {
  status, publicInfo, createSetup, getSetup, updateSetup, deleteClass, deleteArm, deleteClassArm,
  deleteSubject, rename, setAcademicTerm, deleteSchool,
};
