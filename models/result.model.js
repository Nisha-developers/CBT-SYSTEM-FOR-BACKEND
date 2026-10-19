const pool = require('../config/db');
const TYPES = require('../constants/examTypes');

// ---------- class arms ----------
async function findClassArms({ classArmUid, className, armName }) {
  const where = [];
  const params = [];
  if (classArmUid) { where.push('ca.uid = ?'); params.push(classArmUid); }
  if (className) { where.push('c.class_name = ?'); params.push(className); }
  if (armName) { where.push('a.arm_name = ?'); params.push(armName); }
  const [rows] = await pool.query(
    `SELECT ca.class_arm_id, ca.uid, ca.full_class_name, c.class_name, a.arm_name
       FROM class_arm ca JOIN class c ON c.class_id = ca.class_id JOIN arm a ON a.arm_id = ca.arm_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.class_id, a.arm_id`, params);
  return rows;
}

async function findClassArmByUid(uid) {
  const [rows] = await pool.execute('SELECT class_arm_id, full_class_name FROM class_arm WHERE uid = ?', [uid]);
  return rows[0] || null;
}

// ---------- raw data for the class sheet ----------
async function examConfigsFor(t, classArmId, termId) {
  const [rows] = await pool.query(
    `SELECT e.exam_config_id, e.mark, e.subject_kind, e.subject_id,
            COALESCE(s.subject_name, os.subject_name) AS name
       FROM ${t.cfg} e
       LEFT JOIN subjects s ON e.subject_kind = 'compulsory' AND s.id = e.subject_id
       LEFT JOIN optional_subjects os ON e.subject_kind = 'optional' AND os.id = e.subject_id
      WHERE e.class_arm_id = ? AND e.term_id = ?`, [classArmId, termId]);
  return rows;
}

async function scoresFor(t, classArmId, termId) {
  const [rows] = await pool.query(
    `SELECT r.student_id, r.exam_config_id, r.score FROM ${t.results} r
       JOIN ${t.cfg} e ON e.exam_config_id = r.exam_config_id
      WHERE e.class_arm_id = ? AND e.term_id = ?`, [classArmId, termId]);
  return rows;
}

// ---------- release ----------
async function releasedClassArmIds(termId) {
  const [rows] = await pool.execute('SELECT class_arm_id FROM result_releases WHERE term_id = ?', [termId]);
  return rows.map((r) => r.class_arm_id);
}
async function isReleased(classArmId, termId) {
  const [rows] = await pool.execute('SELECT 1 AS ok FROM result_releases WHERE class_arm_id = ? AND term_id = ?', [classArmId, termId]);
  return rows.length > 0;
}
const upsertRelease = (classArmId, termId, adminId) => pool.execute(
  `INSERT INTO result_releases (class_arm_id, term_id, released_by) VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE released_by = VALUES(released_by), released_at = NOW()`, [classArmId, termId, adminId]);
const deleteRelease = (classArmId, termId) =>
  pool.execute('DELETE FROM result_releases WHERE class_arm_id = ? AND term_id = ?', [classArmId, termId]);

// ---------- theory marking ----------
async function theorySheetRows(cfg) {
  const [rows] = await pool.query(
    `SELECT s.id, s.uid, s.student_id, s.first_name, s.last_name,
            at.status AS attempt_status, rt.score, rt.remarks
       FROM students s
       LEFT JOIN exam_attempts at ON at.student_id = s.id AND at.exam_type = 'THEORY' AND at.exam_config_id = ?
       LEFT JOIN results_theory rt ON rt.student_id = s.id AND rt.exam_config_id = ?
       LEFT JOIN student_optional_subjects sos
              ON sos.student_id = s.id AND ? = 'optional' AND sos.optional_subject_id = ?
      WHERE s.class_arm_id = ? AND (? = 'compulsory' OR sos.student_id IS NOT NULL)
      ORDER BY s.last_name, s.first_name`,
    [cfg.exam_config_id, cfg.exam_config_id, cfg.subject_kind, cfg.subject_id, cfg.class_arm_id, cfg.subject_kind]);
  return rows;
}

async function theoryAnswersOf(studentId, cfgId) {
  const [rows] = await pool.query(
    `SELECT q.uid, q.question, l.marks, aa.answer
       FROM exam_attempts at
       JOIN attempt_questions aq ON aq.attempt_id = at.id
       JOIN theory_questions q ON q.id = aq.question_id
       JOIN exam_theory_questions l ON l.question_id = q.id AND l.exam_config_id = at.exam_config_id
       LEFT JOIN attempt_answers aa ON aa.attempt_id = at.id AND aa.question_id = q.id
      WHERE at.student_id = ? AND at.exam_type = 'THEORY' AND at.exam_config_id = ?
      ORDER BY aq.position`, [studentId, cfgId]);
  return rows;
}

const upsertTheoryResult = ({ studentId, cfgId, score, remarks, adminId }) => pool.execute(
  `INSERT INTO results_theory (student_id, exam_config_id, score, remarks, recorded_by) VALUES (?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE score = VALUES(score), remarks = VALUES(remarks), recorded_by = VALUES(recorded_by)`,
  [studentId, cfgId, score, remarks || null, adminId]);

// ---------- history ----------
async function historyPairs(studentId) {
  const pairs = [];
  for (const t of [TYPES.OBJ, TYPES.THEORY]) {
    const [rows] = await pool.query(
      `SELECT DISTINCT e.term_id, e.class_arm_id FROM ${t.results} r
         JOIN ${t.cfg} e ON e.exam_config_id = r.exam_config_id WHERE r.student_id = ?`, [studentId]);
    pairs.push(...rows);
  }
  return pairs;
}

async function termAndClassName(termId, classArmId) {
  const [rows] = await pool.execute(
    `SELECT t.name AS term, s.name AS session, ca.full_class_name
       FROM terms t JOIN academic_sessions s ON s.id = t.academic_session_id
       JOIN class_arm ca ON ca.class_arm_id = ?
      WHERE t.id = ?`, [classArmId, termId]);
  return rows[0] || null;
}

// Total marks available for one subject in one term (OBJ + theory) in the student's class.
async function maxMarkFor({ session, term, subject, studentId }) {
  const part = (cfg) => `(SELECT COALESCE(SUM(e.mark), 0) FROM ${cfg} e
      JOIN terms t ON t.id = e.term_id JOIN academic_sessions s ON s.id = t.academic_session_id
      LEFT JOIN subjects su ON e.subject_kind = 'compulsory' AND su.id = e.subject_id
      LEFT JOIN optional_subjects os ON e.subject_kind = 'optional' AND os.id = e.subject_id
     WHERE s.name = ? AND t.name = ? AND COALESCE(su.subject_name, os.subject_name) = ?
       AND e.class_arm_id = (SELECT class_arm_id FROM students WHERE id = ?))`;
  const [rows] = await pool.query(
    `SELECT ${part('exam_config_obj')} + ${part('exam_config_theory')} AS total`,
    [session, term, subject, studentId, session, term, subject, studentId]);
  return Number(rows[0].total);
}

// ---------- teacher reviews ----------
async function findReview(studentId, termId) {
  const [rows] = await pool.execute(
    `SELECT cognitive, behavioral, academic_remark, cognitive_remark, behavioral_remark, teacher_remark
       FROM student_reviews WHERE student_id = ? AND term_id = ?`, [studentId, termId]);
  return rows[0] || null;
}

const upsertReview = (r) => pool.execute(
  `INSERT INTO student_reviews (student_id, term_id, cognitive, behavioral, academic_remark, cognitive_remark,
                                behavioral_remark, teacher_remark, reviewed_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE cognitive = VALUES(cognitive), behavioral = VALUES(behavioral),
     academic_remark = VALUES(academic_remark), cognitive_remark = VALUES(cognitive_remark),
     behavioral_remark = VALUES(behavioral_remark), teacher_remark = VALUES(teacher_remark),
     reviewed_by = VALUES(reviewed_by)`,
  [r.studentId, r.termId, r.cognitive, r.behavioral, r.academicRemark, r.cognitiveRemark,
    r.behavioralRemark, r.teacherRemark, r.adminId]);

async function reviewsOfStudent(studentId) {
  const [rows] = await pool.execute(
    `SELECT s.name AS session, t.name AS term, v.cognitive, v.behavioral, v.academic_remark, v.cognitive_remark,
            v.behavioral_remark, v.teacher_remark
       FROM student_reviews v JOIN terms t ON t.id = v.term_id JOIN academic_sessions s ON s.id = t.academic_session_id
      WHERE v.student_id = ?`, [studentId]);
  return rows;
}

module.exports = {
  findClassArms, findClassArmByUid, examConfigsFor, scoresFor, releasedClassArmIds, isReleased, upsertRelease,
  deleteRelease, theorySheetRows, theoryAnswersOf, upsertTheoryResult, historyPairs, termAndClassName,
  maxMarkFor, findReview, upsertReview, reviewsOfStudent,
};
