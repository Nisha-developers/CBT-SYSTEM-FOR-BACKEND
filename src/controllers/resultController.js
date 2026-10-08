const db = require('../config/db');
const { toCamelCase } = require('../database/sql');

const resultSelect = `
  r.id AS result_id, r.exam_id AS result_exam_id, r.student_id AS result_student_id,
  r.score AS result_score, r.max_score AS result_max_score, r.remarks AS result_remarks,
  r.status AS result_status, r.session AS result_session, r.term AS result_term,
  r.created_at AS result_created_at, r.updated_at AS result_updated_at,
  e.id AS exam_id, e.title AS exam_title, e.type AS exam_type,
  e.duration_minutes AS exam_duration_minutes, e.total_questions AS exam_total_questions,
  e.instructions AS exam_instructions, e.status AS exam_status,
  e.school_id AS exam_school_id, e.class_id AS exam_class_id,
  e.arm_id AS exam_arm_id, e.subject_id AS exam_subject_id,
  e.created_at AS exam_created_at, e.updated_at AS exam_updated_at,
  s.id AS student_id, s.full_name AS student_full_name,
  s.admission_number AS student_admission_number, s.gender AS student_gender,
  s.date_of_birth AS student_date_of_birth, s.school_id AS student_school_id,
  s.class_id AS student_class_id, s.arm_id AS student_arm_id,
  s.created_at AS student_created_at, s.updated_at AS student_updated_at
`;

function mapResultRow(row, includeStudent = true) {
  const result = {};
  const exam = {};
  const student = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('result_')) result[key.slice(7)] = value;
    else if (key.startsWith('exam_')) exam[key.slice(5)] = value;
    else if (key.startsWith('student_')) student[key.slice(8)] = value;
  }
  const mappedResult = toCamelCase(result);
  mappedResult.Exam = toCamelCase(exam);
  if (includeStudent) mappedResult.Student = toCamelCase(student);
  return mappedResult;
}

function buildExamFilters({ classId, armId, subjectId }) {
  const filters = [];
  const values = [];
  for (const [column, value] of [
    ['e.class_id', classId],
    ['e.arm_id', armId],
    ['e.subject_id', subjectId],
  ]) {
    if (value) {
      filters.push(`${column} = ?`);
      values.push(value);
    }
  }
  return { filters, values };
}

exports.viewResults = async (req, res, next) => {
  try {
    const { filters, values } = buildExamFilters(req.query);
    const [rows] = await db.execute(
      `SELECT ${resultSelect}
       FROM results r
       JOIN exams e ON e.id = r.exam_id
       JOIN students s ON s.id = r.student_id
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}`,
      values
    );
    res.json({ results: rows.map((row) => mapResultRow(row)) });
  } catch (err) {
    next(err);
  }
};

exports.recordTheoryMarks = async (req, res, next) => {
  let connection;
  try {
    const { examId, studentId, score, maxScore, remarks, session, term } = req.body;
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      `SELECT * FROM results WHERE exam_id = ? AND student_id = ?
       LIMIT 1 FOR UPDATE`,
      [examId, studentId]
    );
    let resultId;
    if (existing.length) {
      resultId = existing[0].id;
      await connection.execute(
        `UPDATE results
         SET score = ?, max_score = ?, remarks = ?, \`session\` = ?, term = ?
         WHERE id = ?`,
        [score, maxScore, remarks || null, session || null, term || null, resultId]
      );
    } else {
      const [result] = await connection.execute(
        `INSERT INTO results (exam_id, student_id, score, max_score, remarks, status, \`session\`, term)
         VALUES (?, ?, ?, ?, ?, 'unreleased', ?, ?)`,
        [examId, studentId, score, maxScore, remarks || null, session || null, term || null]
      );
      resultId = result.insertId;
    }
    const [rows] = await connection.execute('SELECT * FROM results WHERE id = ?', [resultId]);
    await connection.commit();
    res.json({ result: toCamelCase(rows[0]) });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
};

exports.releaseResult = async (req, res, next) => {
  try {
    const [result] = await db.execute(
      `UPDATE results SET status = 'released' WHERE id = ?`,
      [req.params.id]
    );
    if (!result.affectedRows) {
      const [rows] = await db.execute('SELECT id FROM results WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: 'Result not found' });
    }
    const [rows] = await db.execute('SELECT * FROM results WHERE id = ?', [req.params.id]);
    res.json({ result: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.releaseBatch = async (req, res, next) => {
  try {
    const { resultIds } = req.body;
    if (!Array.isArray(resultIds)) {
      return res.status(400).json({ message: 'resultIds must be an array' });
    }
    if (resultIds.length) {
      const placeholders = resultIds.map(() => '?').join(', ');
      await db.execute(
        `UPDATE results SET status = 'released' WHERE id IN (${placeholders})`,
        resultIds
      );
    }
    res.json({ message: `${resultIds.length} result(s) released` });
  } catch (err) {
    next(err);
  }
};

exports.pastResults = async (req, res, next) => {
  try {
    const { session, classId, armId, subjectId } = req.query;
    const { filters, values } = buildExamFilters({ classId, armId, subjectId });
    const where = ["r.status = 'released'", ...filters];
    if (session) {
      where.push('r.`session` = ?');
      values.push(session);
    }
    const [rows] = await db.execute(
      `SELECT ${resultSelect}
       FROM results r
       JOIN exams e ON e.id = r.exam_id
       JOIN students s ON s.id = r.student_id
       WHERE ${where.join(' AND ')}`,
      values
    );
    res.json({ results: rows.map((row) => mapResultRow(row)) });
  } catch (err) {
    next(err);
  }
};

exports.myResults = async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT ${resultSelect}
       FROM results r
       JOIN exams e ON e.id = r.exam_id
       JOIN students s ON s.id = r.student_id
       WHERE r.student_id = ? AND r.status = 'released'`,
      [req.user.id]
    );
    res.json({ results: rows.map((row) => mapResultRow(row, false)) });
  } catch (err) {
    next(err);
  }
};
