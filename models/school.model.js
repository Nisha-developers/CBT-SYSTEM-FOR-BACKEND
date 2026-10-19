const pool = require('../config/db');
const { newUid } = require('../utils/uid');

// Every query lists the columns it needs — no SELECT *.
// Public ids are `uid`; integer ids stay internal. `conn` is optional (pass it inside a transaction).
const db = (conn) => conn || pool;
const one = async (conn, sql, params) => (await db(conn).execute(sql, params))[0][0] || null;
const countOf = async (conn, sql, params) => (await db(conn).execute(sql, params))[0][0].c;

// ---------------- SCHOOL ----------------
const findSchool = (conn) => one(conn,
  'SELECT id, name, phone, email, motto, logo, description, headline, address FROM schools LIMIT 1', []);

async function insertSchool(s, conn) {
  const [r] = await db(conn).execute(
    `INSERT INTO schools (name, phone, email, motto, logo, description, headline, address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.name, s.phone, s.email, s.motto, s.logo ?? null, s.description, s.headline, s.address]);
  return r.insertId;
}

async function updateSchool(id, s, conn) {
  await db(conn).execute(
    `UPDATE schools SET name = ?, phone = ?, email = ?, motto = ?, logo = ?, description = ?, headline = ?, address = ?
      WHERE id = ?`,
    [s.name, s.phone, s.email, s.motto, s.logo ?? null, s.description, s.headline, s.address, id]);
}

// ---------------- CLASS / ARM / CLASS_ARM ----------------
async function insertClass(name, conn) {
  const [r] = await db(conn).execute('INSERT INTO class (uid, class_name) VALUES (?, ?)', [newUid(), name]);
  return r.insertId;
}
async function insertArm(name, conn) {
  const [r] = await db(conn).execute('INSERT INTO arm (uid, arm_name) VALUES (?, ?)', [newUid(), name]);
  return r.insertId;
}
async function insertClassArm({ armId, classId, fullClassName }, conn) {
  const [r] = await db(conn).execute(
    'INSERT INTO class_arm (uid, arm_id, class_id, full_class_name) VALUES (?, ?, ?, ?)',
    [newUid(), armId, classId, fullClassName]);
  return r.insertId;
}
const findAllClasses = async (conn) => (await db(conn).query('SELECT class_id, uid, class_name FROM class ORDER BY class_id'))[0];
const findAllArms = async (conn) => (await db(conn).query('SELECT arm_id, uid, arm_name FROM arm ORDER BY arm_id'))[0];
const findAllClassArms = async (conn) => (await db(conn).query(
  `SELECT ca.class_arm_id, ca.uid, ca.full_class_name, c.class_id, c.uid AS class_uid, c.class_name,
          a.arm_id, a.uid AS arm_uid, a.arm_name
     FROM class_arm ca JOIN class c ON c.class_id = ca.class_id JOIN arm a ON a.arm_id = ca.arm_id
    ORDER BY ca.class_arm_id`))[0];

const findClassByName = (name, conn) => one(conn, 'SELECT class_id, uid, class_name FROM class WHERE class_name = ? LIMIT 1', [name]);
const findArmByName = (name, conn) => one(conn, 'SELECT arm_id, uid, arm_name FROM arm WHERE arm_name = ? LIMIT 1', [name]);
const findClassArmByFullName = (name, conn) => one(conn,
  'SELECT class_arm_id, uid, full_class_name FROM class_arm WHERE full_class_name = ? LIMIT 1', [name]);
const findClassByUid = (uid, conn) => one(conn, 'SELECT class_id, uid, class_name FROM class WHERE uid = ? LIMIT 1', [uid]);
const findArmByUid = (uid, conn) => one(conn, 'SELECT arm_id, uid, arm_name FROM arm WHERE uid = ? LIMIT 1', [uid]);
const findClassArmByUid = (uid, conn) => one(conn,
  `SELECT class_arm_id, uid, class_id, full_class_name FROM class_arm WHERE uid = ? LIMIT 1`, [uid]);

// ---------------- SUBJECTS: one code path for compulsory + optional ----------------
const SUBJECT_TABLES = {
  compulsory: { table: 'subjects', junction: 'subject_class_junction' },
  optional: { table: 'optional_subjects', junction: 'optional_subject_class_junction' },
};
const T = (kind) => SUBJECT_TABLES[kind];

async function insertSubject(kind, name, conn) {
  const [r] = await db(conn).execute(`INSERT INTO ${T(kind).table} (uid, subject_name) VALUES (?, ?)`, [newUid(), name]);
  return r.insertId;
}
const linkSubject = (kind, subjectId, classArmId, conn) => db(conn).execute(
  `INSERT INTO ${T(kind).junction} (subject_id, class_arm_id) VALUES (?, ?)`, [subjectId, classArmId]);
const clearSubjectLinks = (kind, subjectId, conn) => db(conn).execute(
  `DELETE FROM ${T(kind).junction} WHERE subject_id = ?`, [subjectId]);
const findAllSubjects = async (kind, conn) => (await db(conn).query(
  `SELECT id, uid, subject_name FROM ${T(kind).table} ORDER BY id`))[0];
const findAllSubjectLinks = async (kind, conn) => (await db(conn).query(
  `SELECT subject_id, class_arm_id FROM ${T(kind).junction}`))[0];
const findSubjectByName = (kind, name, conn) => one(conn,
  `SELECT id, uid, subject_name FROM ${T(kind).table} WHERE subject_name = ? LIMIT 1`, [name]);
const findSubjectByUid = (kind, uid, conn) => one(conn,
  `SELECT id, uid, subject_name FROM ${T(kind).table} WHERE uid = ? LIMIT 1`, [uid]);
const renameSubject = (kind, id, name, conn) => db(conn).execute(
  `UPDATE ${T(kind).table} SET subject_name = ? WHERE id = ?`, [name, id]);
async function deleteSubject(kind, id, conn) {
  await db(conn).execute(`DELETE FROM ${T(kind).junction} WHERE subject_id = ?`, [id]);
  await db(conn).execute(`DELETE FROM ${T(kind).table} WHERE id = ?`, [id]);
}
const isSubjectOffered = async (kind, subjectId, classArmId, conn) => !!(await one(conn,
  `SELECT 1 AS ok FROM ${T(kind).junction} WHERE subject_id = ? AND class_arm_id = ?`, [subjectId, classArmId]));

// ---------------- RENAME (keeps "SS2 A" names in sync) ----------------
const SYNC_FULL_NAMES = `UPDATE class_arm ca JOIN class c ON c.class_id = ca.class_id JOIN arm a ON a.arm_id = ca.arm_id
  SET ca.full_class_name = CONCAT(c.class_name, ' ', a.arm_name)`;
async function renameClass(id, name, conn) {
  await db(conn).execute('UPDATE class SET class_name = ? WHERE class_id = ?', [name, id]);
  await db(conn).execute(`${SYNC_FULL_NAMES} WHERE ca.class_id = ?`, [id]);
}
async function renameArm(id, name, conn) {
  await db(conn).execute('UPDATE arm SET arm_name = ? WHERE arm_id = ?', [name, id]);
  await db(conn).execute(`${SYNC_FULL_NAMES} WHERE ca.arm_id = ?`, [id]);
}

// ---------------- "is it still in use?" counts (guard deletes) ----------------
const countClassArmsByClass = (id, conn) => countOf(conn, 'SELECT COUNT(*) AS c FROM class_arm WHERE class_id = ?', [id]);
const countClassArmsByArm = (id, conn) => countOf(conn, 'SELECT COUNT(*) AS c FROM class_arm WHERE arm_id = ?', [id]);
const countStudentsInClassArm = (id, conn) => countOf(conn, 'SELECT COUNT(*) AS c FROM students WHERE class_arm_id = ?', [id]);
const countExamConfigsInClassArm = (table, id, conn) => countOf(conn, `SELECT COUNT(*) AS c FROM ${table} WHERE class_arm_id = ?`, [id]);
const countQuestionsOfSubject = (table, id, kind, conn) =>
  countOf(conn, `SELECT COUNT(*) AS c FROM ${table} WHERE subject_id = ? AND subject_kind = ?`, [id, kind]);
const countExamConfigsOfSubject = (id, kind, conn) => countOf(conn,
  `SELECT (SELECT COUNT(*) FROM exam_config_obj WHERE subject_id = ? AND subject_kind = ?) +
          (SELECT COUNT(*) FROM exam_config_theory WHERE subject_id = ? AND subject_kind = ?) AS c`, [id, kind, id, kind]);
const countStudentsUsingOptional = (id, conn) => countOf(conn,
  'SELECT COUNT(*) AS c FROM student_optional_subjects WHERE optional_subject_id = ?', [id]);

const deleteClass = (id, conn) => db(conn).execute('DELETE FROM class WHERE class_id = ?', [id]);
const deleteArm = (id, conn) => db(conn).execute('DELETE FROM arm WHERE arm_id = ?', [id]);
async function deleteClassArm(id, conn) {
  await db(conn).execute('DELETE FROM subject_class_junction WHERE class_arm_id = ?', [id]);
  await db(conn).execute('DELETE FROM optional_subject_class_junction WHERE class_arm_id = ?', [id]);
  await db(conn).execute('DELETE FROM class_arm WHERE class_arm_id = ?', [id]);
}

async function countStudentsByClass(conn) {
  const [rows] = await db(conn).query(
    `SELECT ca.class_id, COUNT(s.id) AS c FROM class_arm ca
       LEFT JOIN students s ON s.class_arm_id = ca.class_arm_id GROUP BY ca.class_id`);
  return rows;
}
async function countStudentsByClassArm(conn) {
  const [rows] = await db(conn).query(
    `SELECT ca.class_arm_id, COUNT(s.id) AS c FROM class_arm ca
       LEFT JOIN students s ON s.class_arm_id = ca.class_arm_id GROUP BY ca.class_arm_id`);
  return rows;
}

// "Return the system to its original state."
async function truncateEverything() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    const [tables] = await conn.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
    for (const t of tables) await conn.query(`TRUNCATE TABLE \`${t.name}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

module.exports = {
  findSchool, insertSchool, updateSchool,
  insertClass, insertArm, insertClassArm, findAllClasses, findAllArms, findAllClassArms,
  findClassByName, findArmByName, findClassArmByFullName, findClassByUid, findArmByUid, findClassArmByUid,
  insertSubject, linkSubject, clearSubjectLinks, findAllSubjects, findAllSubjectLinks, findSubjectByName,
  findSubjectByUid, renameSubject, deleteSubject, isSubjectOffered,
  renameClass, renameArm,
  countClassArmsByClass, countClassArmsByArm, countStudentsInClassArm, countExamConfigsInClassArm,
  countQuestionsOfSubject, countExamConfigsOfSubject, countStudentsUsingOptional,
  deleteClass, deleteArm, deleteClassArm, countStudentsByClass, countStudentsByClassArm, truncateEverything,
};
