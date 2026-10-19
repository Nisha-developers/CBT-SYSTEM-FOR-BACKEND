const pool = require('../config/db');
const TYPES = require('../constants/examTypes');

const db = (conn) => conn || pool;

// ---------- config rows (one joined SELECT for both exam types) ----------
const COMMON_COLS = `e.exam_config_id, e.uid, e.title, e.instructions, e.total_question_set, e.mark_per_question,
  e.open_exam, e.duration, e.time_of_exam, e.date_of_exam, e.mark, e.pass_mark, e.subject_kind, e.subject_id,
  e.class_arm_id, e.term_id, e.created_at`;
const EXTRA_COLS = {
  OBJ: 'e.question_display, e.passage, e.true_or_false',
  THEORY: 'e.total_question_set AS question_display, 0 AS passage, 0 AS true_or_false',
};

function selectConfig(t) {
  return `
    SELECT ${COMMON_COLS}, ${EXTRA_COLS[t.type]}, '${t.type}' AS exam_type,
           COALESCE(s.uid, os.uid) AS subject_uid,
           COALESCE(s.subject_name, os.subject_name) AS subject_name,
           ca.uid AS class_arm_uid, ca.full_class_name, c.class_name, a.arm_name,
           term.name AS term_name, sess.name AS session_name,
           (SELECT COUNT(*) FROM ${t.link} l WHERE l.exam_config_id = e.exam_config_id) AS uploaded,
           (SELECT COUNT(*) FROM exam_attempts at2
             WHERE at2.exam_type = '${t.type}' AND at2.exam_config_id = e.exam_config_id) AS attempts
      FROM ${t.cfg} e
      LEFT JOIN subjects s ON e.subject_kind = 'compulsory' AND s.id = e.subject_id
      LEFT JOIN optional_subjects os ON e.subject_kind = 'optional' AND os.id = e.subject_id
      JOIN class_arm ca ON ca.class_arm_id = e.class_arm_id
      JOIN class c ON c.class_id = ca.class_id
      JOIN arm a ON a.arm_id = ca.arm_id
      JOIN terms term ON term.id = e.term_id
      JOIN academic_sessions sess ON sess.id = term.academic_session_id`;
}

async function findConfigByUid(t, uid, conn) {
  const [rows] = await db(conn).query(`${selectConfig(t)} WHERE e.uid = ?`, [uid]);
  return rows[0] || null;
}

async function findConfigById(t, id, conn) {
  const [rows] = await db(conn).query(`${selectConfig(t)} WHERE e.exam_config_id = ?`, [id]);
  return rows[0] || null;
}

async function listConfigs(t, termId) {
  const [rows] = await pool.query(
    `${selectConfig(t)} ${termId ? 'WHERE e.term_id = ?' : ''} ORDER BY e.created_at DESC, e.exam_config_id DESC`,
    termId ? [termId] : []);
  return rows;
}

async function listConfigsForClassArm(t, classArmId, termId) {
  const [rows] = await pool.query(
    `${selectConfig(t)} WHERE e.class_arm_id = ? AND e.term_id = ? ORDER BY e.date_of_exam, e.time_of_exam`,
    [classArmId, termId]);
  return rows;
}

async function insertConfig(t, d, conn) {
  const c = db(conn);
  if (t.type === 'OBJ') {
    const [r] = await c.execute(
      `INSERT INTO exam_config_obj
        (uid, title, instructions, total_question_set, question_display, mark_per_question, passage, true_or_false,
         open_exam, duration, time_of_exam, date_of_exam, mark, pass_mark, subject_kind, subject_id,
         class_arm_id, term_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.uid, d.title, d.instructions, d.totalQuestions, d.questionsToDisplay, d.markPerQuestion, d.passage,
        d.trueOrFalse, d.openExam, d.durationMinutes, d.time, d.date, d.mark, d.passMark, d.subjectKind,
        d.subjectId, d.classArmId, d.termId, d.createdBy]);
    return r.insertId;
  }
  const [r] = await c.execute(
    `INSERT INTO exam_config_theory
      (uid, title, instructions, total_question_set, mark_per_question, open_exam, duration, time_of_exam,
       date_of_exam, mark, pass_mark, subject_kind, subject_id, class_arm_id, term_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [d.uid, d.title, d.instructions, d.totalQuestions, d.markPerQuestion, d.openExam, d.durationMinutes, d.time,
      d.date, d.mark, d.passMark, d.subjectKind, d.subjectId, d.classArmId, d.termId, d.createdBy]);
  return r.insertId;
}

const setOpen = (t, id, open) => pool.execute(`UPDATE ${t.cfg} SET open_exam = ? WHERE exam_config_id = ?`, [open, id]);
const removeConfig = (t, id, conn) => db(conn).execute(`DELETE FROM ${t.cfg} WHERE exam_config_id = ?`, [id]);

// ---------- lookups used when creating an exam ----------
async function findClassArmByUid(uid, conn) {
  const [rows] = await db(conn).execute(
    'SELECT class_arm_id, class_id, full_class_name FROM class_arm WHERE uid = ?', [uid]);
  return rows[0] || null;
}

async function findSubjectIdByUid(kind, uid, conn) {
  const table = kind === 'optional' ? 'optional_subjects' : 'subjects';
  const [rows] = await db(conn).execute(`SELECT id FROM ${table} WHERE uid = ?`, [uid]);
  return rows[0]?.id || null;
}

// ---------- questions ----------
async function listObjQuestions(cfgId) {
  const [rows] = await pool.query(
    `SELECT q.uid, q.question, q.passage, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option
       FROM obj_questions q JOIN exam_obj_questions l ON l.question_id = q.id
      WHERE l.exam_config_id = ? ORDER BY q.id`, [cfgId]);
  return rows;
}

async function listTheoryQuestions(cfgId) {
  const [rows] = await pool.query(
    `SELECT q.uid, q.question, l.marks FROM theory_questions q
       JOIN exam_theory_questions l ON l.question_id = q.id
      WHERE l.exam_config_id = ? ORDER BY q.id`, [cfgId]);
  return rows;
}

async function questionIdsOf(t, cfgId, conn) {
  const [rows] = await db(conn).query(`SELECT question_id FROM ${t.link} WHERE exam_config_id = ? ORDER BY question_id`, [cfgId]);
  return rows.map((r) => r.question_id);
}

async function insertObjQuestion(q, conn) {
  const [r] = await db(conn).execute(
    `INSERT INTO obj_questions (uid, question, passage, option_a, option_b, option_c, option_d, correct_option,
                                subject_kind, subject_id, class_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [q.uid, q.text, q.passage, q.options.A, q.options.B, q.options.C || null, q.options.D || null,
      q.correctOption, q.subjectKind, q.subjectId, q.classId]);
  return r.insertId;
}

async function insertTheoryQuestion(q, conn) {
  const [r] = await db(conn).execute(
    'INSERT INTO theory_questions (uid, question, subject_kind, subject_id, class_id) VALUES (?,?,?,?,?)',
    [q.uid, q.text, q.subjectKind, q.subjectId, q.classId]);
  return r.insertId;
}

const linkObjQuestion = (cfgId, qId, conn) =>
  db(conn).execute('INSERT INTO exam_obj_questions (exam_config_id, question_id) VALUES (?, ?)', [cfgId, qId]);
const linkTheoryQuestion = (cfgId, qId, marks, conn) =>
  db(conn).execute('INSERT INTO exam_theory_questions (exam_config_id, question_id, marks) VALUES (?, ?, ?)', [cfgId, qId, marks]);

async function findQuestionInExam(t, cfgId, questionUid) {
  const [rows] = await pool.execute(
    `SELECT q.id FROM ${t.q} q JOIN ${t.link} l ON l.question_id = q.id
      WHERE q.uid = ? AND l.exam_config_id = ?`, [questionUid, cfgId]);
  return rows[0]?.id || null;
}

const removeQuestion = (t, id) => pool.execute(`DELETE FROM ${t.q} WHERE id = ?`, [id]);
const removeQuestions = (t, ids, conn) => (ids.length ? db(conn).query(`DELETE FROM ${t.q} WHERE id IN (?)`, [ids]) : null);

module.exports = {
  TYPES, selectConfig, findConfigByUid, findConfigById, listConfigs, listConfigsForClassArm, insertConfig, setOpen,
  removeConfig, findClassArmByUid, findSubjectIdByUid, listObjQuestions, listTheoryQuestions, questionIdsOf,
  insertObjQuestion, insertTheoryQuestion, linkObjQuestion, linkTheoryQuestion, findQuestionInExam,
  removeQuestion, removeQuestions,
};
