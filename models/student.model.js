const pool = require('../config/db');

const db = (conn) => conn || pool;

// Student + class/arm names in one row.
const SELECT = `
  SELECT s.id, s.uid, s.student_id, s.first_name, s.last_name, s.gender, s.class_arm_id, s.password_changed,
         s.created_at, ca.uid AS class_arm_uid, ca.full_class_name, c.class_name, a.arm_name
    FROM students s
    JOIN class_arm ca ON ca.class_arm_id = s.class_arm_id
    JOIN class c ON c.class_id = ca.class_id
    JOIN arm a ON a.arm_id = ca.arm_id`;

function buildFilter({ classArmUid, classUid, armUid, className, armName, search }) {
  const where = [];
  const params = [];
  if (classArmUid) { where.push('ca.uid = ?'); params.push(classArmUid); }
  if (classUid) { where.push('c.uid = ?'); params.push(classUid); }
  if (armUid) { where.push('a.uid = ?'); params.push(armUid); }
  if (className) { where.push('c.class_name = ?'); params.push(className); }
  if (armName) { where.push('a.arm_name = ?'); params.push(armName); }
  if (search) {
    where.push(`(LOWER(s.first_name) LIKE ? OR LOWER(s.last_name) LIKE ? OR LOWER(s.student_id) LIKE ?
                 OR LOWER(CONCAT(s.first_name, ' ', s.last_name)) LIKE ?)`);
    const like = `%${search.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`;
    params.push(like, like, like, like);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function list(filters, limit, offset) {
  const { clause, params } = buildFilter(filters);
  const [rows] = await pool.query(
    `${SELECT} ${clause} ORDER BY c.class_id, a.arm_id, s.last_name, s.first_name LIMIT ? OFFSET ?`,
    [...params, limit, offset]);
  return rows;
}

async function count(filters) {
  const { clause, params } = buildFilter(filters);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM students s
       JOIN class_arm ca ON ca.class_arm_id = s.class_arm_id
       JOIN class c ON c.class_id = ca.class_id JOIN arm a ON a.arm_id = ca.arm_id ${clause}`, params);
  return row.total;
}

async function findByUid(uid) {
  const [rows] = await pool.execute(`${SELECT} WHERE s.uid = ?`, [uid]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(`${SELECT} WHERE s.id = ?`, [id]);
  return rows[0] || null;
}

async function findForLogin(studentId) {
  const [rows] = await pool.execute(
    `${SELECT.replace('s.password_changed,', 's.password_changed, s.password_hash,')} WHERE LOWER(s.student_id) = ? LIMIT 1`,
    [studentId.toLowerCase()]);
  return rows[0] || null;
}

async function findAuthById(id) {
  const [rows] = await pool.execute('SELECT id, uid, class_arm_id FROM students WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findAuthByUid(uid) {
  const [rows] = await pool.execute('SELECT id, uid, class_arm_id FROM students WHERE uid = ?', [uid]);
  return rows[0] || null;
}
async function findAuthByStudentId(studentId) {
  const [rows] = await pool.execute('SELECT id, uid, class_arm_id FROM students WHERE student_id = ?', [studentId]);
  return rows[0] || null;
}


async function findCredentials(id) {
  const [rows] = await pool.execute('SELECT id, password_hash, password_changed FROM students WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findBasicByUid(uid, conn, { lock = false } = {}) {
  const [rows] = await db(conn).execute(
    `SELECT id, student_id, first_name, last_name, gender, class_arm_id FROM students WHERE uid = ? ${lock ? 'FOR UPDATE' : ''}`,
    [uid]);
  return rows[0] || null;
}

async function findByClassArm(classArmId) {
  const [rows] = await pool.execute(
    `SELECT id, uid, student_id, first_name, last_name, gender FROM students
      WHERE class_arm_id = ? ORDER BY last_name, first_name`, [classArmId]);
  return rows;
}

async function insert({ uid, studentId, firstName, lastName, gender, classArmId, passwordHash }, conn) {
  const [r] = await db(conn).execute(
    `INSERT INTO students (uid, student_id, first_name, last_name, gender, class_arm_id, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uid, studentId, firstName, lastName, gender, classArmId, passwordHash]);
  return r.insertId;
}

async function update(id, { studentId, firstName, lastName, gender, classArmId }, conn) {
  await db(conn).execute(
    'UPDATE students SET student_id = ?, first_name = ?, last_name = ?, gender = ?, class_arm_id = ? WHERE id = ?',
    [studentId, firstName, lastName, gender, classArmId, id]);
}

async function remove(id) {
  await pool.execute('DELETE FROM students WHERE id = ?', [id]);
}

async function updatePassword(id, passwordHash, changed) {
  await pool.execute('UPDATE students SET password_hash = ?, password_changed = ? WHERE id = ?', [passwordHash, changed, id]);
}

// ---------- optional subjects ----------
async function optionalSubjectsOf(studentIds) {
  if (!studentIds.length) return [];
  const [rows] = await pool.query(
    `SELECT sos.student_id, o.uid, o.subject_name
       FROM student_optional_subjects sos JOIN optional_subjects o ON o.id = sos.optional_subject_id
      WHERE sos.student_id IN (?)`, [studentIds]);
  return rows;
}

async function enrolledOptionalUids(studentId) {
  const [rows] = await pool.execute(
    `SELECT o.uid FROM student_optional_subjects sos JOIN optional_subjects o ON o.id = sos.optional_subject_id
      WHERE sos.student_id = ?`, [studentId]);
  return rows.map((r) => r.uid);
}

async function enrolledPairs(studentIds) {
  if (!studentIds.length) return [];
  const [rows] = await pool.query(
    'SELECT student_id, optional_subject_id FROM student_optional_subjects WHERE student_id IN (?)', [studentIds]);
  return rows;
}

// uids → internal ids, but only those offered in the given class arm
async function resolveOptionalIds(classArmId, uids, conn) {
  if (!uids.length) return [];
  const [rows] = await db(conn).query(
    `SELECT o.id FROM optional_subjects o
       JOIN optional_subject_class_junction j ON j.subject_id = o.id AND j.class_arm_id = ?
      WHERE o.uid IN (?)`, [classArmId, uids]);
  return rows.map((r) => r.id);
}

async function replaceOptionalSubjects(studentId, optionalIds, conn) {
  const c = db(conn);
  await c.execute('DELETE FROM student_optional_subjects WHERE student_id = ?', [studentId]);
  for (const id of optionalIds) {
    await c.execute('INSERT INTO student_optional_subjects (student_id, optional_subject_id) VALUES (?, ?)', [studentId, id]);
  }
}

module.exports = {
  list, count, findByUid, findById, findForLogin, findAuthById, findAuthByUid, findCredentials, findBasicByUid,
  findByClassArm, insert, update, remove, updatePassword,
  optionalSubjectsOf, enrolledOptionalUids, enrolledPairs, resolveOptionalIds, replaceOptionalSubjects, findAuthByStudentId
};
