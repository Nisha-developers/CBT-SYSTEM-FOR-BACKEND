const pool = require('../config/db');

const COLS = 'id, uid, student_id, exam_type, exam_config_id, started_at, ends_at, submitted_at, status';
const db = (conn) => conn || pool;

async function find(studentId, type, cfgId, conn, { lock = false } = {}) {
  const [rows] = await db(conn).execute(
    `SELECT ${COLS} FROM exam_attempts WHERE student_id = ? AND exam_type = ? AND exam_config_id = ?
     ${lock ? 'FOR UPDATE' : ''}`, [studentId, type, cfgId]);
  return rows[0] || null;
}

async function findByUidForStudent(uid, studentId, conn, { lock = false } = {}) {
  const [rows] = await db(conn).execute(
    `SELECT ${COLS} FROM exam_attempts WHERE uid = ? AND student_id = ? ${lock ? 'FOR UPDATE' : ''}`, [uid, studentId]);
  return rows[0] || null;
}

async function insert({ uid, studentId, type, cfgId, startedAt, endsAt }, conn) {
  const [r] = await db(conn).execute(
    `INSERT INTO exam_attempts (uid, student_id, exam_type, exam_config_id, started_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [uid, studentId, type, cfgId, startedAt, endsAt]);
  return r.insertId;
}

async function insertQuestions(attemptId, questionIds, conn) {
  for (let i = 0; i < questionIds.length; i += 1) {
    await db(conn).execute(
      'INSERT INTO attempt_questions (attempt_id, question_id, position) VALUES (?, ?, ?)', [attemptId, questionIds[i], i + 1]);
  }
}

async function statusesFor(studentId, type) {
  const [rows] = await pool.execute(
    'SELECT exam_config_id, status FROM exam_attempts WHERE student_id = ? AND exam_type = ?', [studentId, type]);
  return rows;
}

// ---------- answers ----------
async function answersOf(attemptId) {
  const [rows] = await pool.execute('SELECT question_id, answer FROM attempt_answers WHERE attempt_id = ?', [attemptId]);
  return rows;
}

async function questionUidMap(attemptId, type) {
  const [rows] = await pool.query(
    `SELECT aq.question_id, COALESCE(oq.uid, tq.uid) AS uid
       FROM attempt_questions aq
       LEFT JOIN obj_questions oq ON ? = 'OBJ' AND oq.id = aq.question_id
       LEFT JOIN theory_questions tq ON ? = 'THEORY' AND tq.id = aq.question_id
      WHERE aq.attempt_id = ?`, [type, type, attemptId]);
  return rows;
}

async function findQuestionInAttempt(questionTable, attemptId, questionUid) {
  const [rows] = await pool.execute(
    `SELECT q.id FROM ${questionTable} q JOIN attempt_questions aq ON aq.question_id = q.id AND aq.attempt_id = ?
      WHERE q.uid = ?`, [attemptId, questionUid]);
  return rows[0]?.id || null;
}

const upsertAnswer = (attemptId, questionId, answer) => pool.execute(
  `INSERT INTO attempt_answers (attempt_id, question_id, answer) VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE answer = VALUES(answer)`, [attemptId, questionId, answer]);
const deleteAnswer = (attemptId, questionId) => pool.execute(
  'DELETE FROM attempt_answers WHERE attempt_id = ? AND question_id = ?', [attemptId, questionId]);

// ---------- the paper a student sees (never includes correct answers) ----------
async function objPaper(attemptId) {
  const [rows] = await pool.query(
    `SELECT q.uid, q.question, q.passage, q.option_a, q.option_b, q.option_c, q.option_d
       FROM attempt_questions aq JOIN obj_questions q ON q.id = aq.question_id
      WHERE aq.attempt_id = ? ORDER BY aq.position`, [attemptId]);
  return rows;
}

async function theoryPaper(attemptId, cfgId) {
  const [rows] = await pool.query(
    `SELECT q.uid, q.question, l.marks
       FROM attempt_questions aq
       JOIN theory_questions q ON q.id = aq.question_id
       JOIN exam_theory_questions l ON l.question_id = q.id AND l.exam_config_id = ?
      WHERE aq.attempt_id = ? ORDER BY aq.position`, [cfgId, attemptId]);
  return rows;
}

// ---------- marking ----------
async function countCorrect(attemptId, conn) {
  const [[row]] = await db(conn).execute(
    `SELECT COUNT(*) AS correct
       FROM attempt_questions aq
       JOIN attempt_answers aa ON aa.attempt_id = aq.attempt_id AND aa.question_id = aq.question_id
       JOIN obj_questions q ON q.id = aq.question_id
      WHERE aq.attempt_id = ? AND aa.answer = q.correct_option`, [attemptId]);
  return row.correct;
}

const upsertObjResult = (studentId, cfgId, score, conn) => db(conn).execute(
  `INSERT INTO results_obj (student_id, exam_config_id, score) VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE score = VALUES(score)`, [studentId, cfgId, score]);

const markSubmitted = (attemptId, conn) => db(conn).execute(
  "UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW() WHERE id = ?", [attemptId]);

module.exports = {
  find, findByUidForStudent, insert, insertQuestions, statusesFor, answersOf, questionUidMap,
  findQuestionInAttempt, upsertAnswer, deleteAnswer, objPaper, theoryPaper, countCorrect, upsertObjResult, markSubmitted,
};
