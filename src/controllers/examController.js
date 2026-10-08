const db = require('../config/db');
const { toCamelCase } = require('../database/sql');

const parseAnswers = (answers) => {
  if (typeof answers === 'string') return JSON.parse(answers);
  return answers || {};
};

exports.createExam = async (req, res, next) => {
  try {
    const { title, type, classId, armId, subjectId, durationMinutes, instructions } = req.body;
    const [result] = await db.execute(
      `INSERT INTO exams
        (title, type, class_id, arm_id, subject_id, duration_minutes, instructions, school_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        type,
        classId,
        armId,
        subjectId,
        durationMinutes || 60,
        instructions || null,
        req.user.schoolId,
      ]
    );
    const [rows] = await db.execute('SELECT * FROM exams WHERE id = ?', [result.insertId]);
    res.status(201).json({ exam: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.listExams = async (req, res, next) => {
  try {
    const { classId, armId, type, status } = req.query;
    let sql = 'SELECT * FROM exams WHERE school_id = ?';
    const values = [req.user.schoolId];
    for (const [column, value] of [
      ['class_id', classId],
      ['arm_id', armId],
      ['type', type],
      ['status', status],
    ]) {
      if (value) {
        sql += ` AND ${column} = ?`;
        values.push(value);
      }
    }
    const [rows] = await db.execute(sql, values);
    res.json({ exams: rows.map(toCamelCase) });
  } catch (err) {
    next(err);
  }
};

exports.getExam = async (req, res, next) => {
  try {
    const [examRows] = await db.execute(
      'SELECT * FROM exams WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, req.user.schoolId]
    );
    if (!examRows.length) return res.status(404).json({ message: 'Exam not found' });
    const [questionRows] = await db.execute(
      'SELECT * FROM questions WHERE exam_id = ?',
      [req.params.id]
    );
    const exam = toCamelCase(examRows[0]);
    exam.questions = questionRows.map(toCamelCase);
    res.json({ exam });
  } catch (err) {
    next(err);
  }
};

exports.addQuestion = async (req, res, next) => {
  let connection;
  try {
    const { text, options, correctOption } = req.body;
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO questions (exam_id, text, options, correct_option)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, text, options == null ? null : JSON.stringify(options), correctOption || null]
    );
    await connection.execute(
      'UPDATE exams SET total_questions = total_questions + 1 WHERE id = ?',
      [req.params.id]
    );
    const [rows] = await connection.execute('SELECT * FROM questions WHERE id = ?', [result.insertId]);
    await connection.commit();
    res.status(201).json({ question: toCamelCase(rows[0]) });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
};

exports.publishExam = async (req, res, next) => {
  try {
    const [result] = await db.execute(
      `UPDATE exams SET status = 'active'
       WHERE id = ? AND school_id = ?`,
      [req.params.id, req.user.schoolId]
    );
    if (!result.affectedRows) {
      const [rows] = await db.execute(
        'SELECT id FROM exams WHERE id = ? AND school_id = ?',
        [req.params.id, req.user.schoolId]
      );
      if (!rows.length) return res.status(404).json({ message: 'Exam not found' });
    }
    const [rows] = await db.execute(
      'SELECT * FROM exams WHERE id = ? AND school_id = ?',
      [req.params.id, req.user.schoolId]
    );
    res.json({ exam: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.availableExams = async (req, res, next) => {
  try {
    const [students] = await db.execute(
      'SELECT class_id, arm_id FROM students WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!students.length) return res.status(404).json({ message: 'Student not found' });
    const [rows] = await db.execute(
      `SELECT * FROM exams
       WHERE class_id = ? AND arm_id = ? AND status = 'active'`,
      [students[0].class_id, students[0].arm_id]
    );
    res.json({ exams: rows.map(toCamelCase) });
  } catch (err) {
    next(err);
  }
};

exports.startAttempt = async (req, res, next) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT * FROM exam_attempts
       WHERE exam_id = ? AND student_id = ? AND status = 'in_progress'
       LIMIT 1 FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    let attempt = rows[0];
    if (!attempt) {
      const [result] = await connection.execute(
        `INSERT INTO exam_attempts (exam_id, student_id, started_at, answers, status)
         VALUES (?, ?, NOW(), JSON_OBJECT(), 'in_progress')`,
        [req.params.id, req.user.id]
      );
      const [created] = await connection.execute('SELECT * FROM exam_attempts WHERE id = ?', [result.insertId]);
      [attempt] = created;
    }
    await connection.commit();
    res.json({ attempt: toCamelCase(attempt) });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
};

exports.saveAnswer = async (req, res, next) => {
  let connection;
  try {
    const { questionId, answer } = req.body;
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT * FROM exam_attempts
       WHERE id = ? AND student_id = ? AND status = 'in_progress'
       LIMIT 1 FOR UPDATE`,
      [req.params.attemptId, req.user.id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Attempt not found' });
    }
    const attempt = toCamelCase(rows[0]);
    const answers = parseAnswers(attempt.answers);
    answers[questionId] = answer;
    await connection.execute(
      'UPDATE exam_attempts SET answers = ? WHERE id = ?',
      [JSON.stringify(answers), attempt.id]
    );
    const [updated] = await connection.execute('SELECT * FROM exam_attempts WHERE id = ?', [attempt.id]);
    await connection.commit();
    res.json({ attempt: toCamelCase(updated[0]) });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
};

exports.submitAttempt = async (req, res, next) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [attemptRows] = await connection.execute(
      `SELECT ea.*, e.type AS exam_type
       FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       WHERE ea.id = ? AND ea.student_id = ?
       LIMIT 1 FOR UPDATE`,
      [req.params.attemptId, req.user.id]
    );
    if (!attemptRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Attempt not found' });
    }

    const attempt = toCamelCase(attemptRows[0]);
    const [examRows] = await connection.execute(
      'SELECT * FROM exams WHERE id = ?',
      [attempt.examId]
    );
    const exam = toCamelCase(examRows[0]);
    const [questionRows] = await connection.execute(
      'SELECT * FROM questions WHERE exam_id = ?',
      [attempt.examId]
    );
    exam.questions = questionRows.map(toCamelCase);

    await connection.execute(
      `UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW()
       WHERE id = ?`,
      [attempt.id]
    );
    if (exam.type === 'OBJ') {
      const answers = parseAnswers(attempt.answers);
      const score = exam.questions.reduce(
        (total, question) => total + (answers[question.id] === question.correctOption ? 1 : 0),
        0
      );
      await connection.execute(
        `INSERT INTO results (exam_id, student_id, score, max_score, status)
         VALUES (?, ?, ?, ?, 'unreleased')`,
        [attempt.examId, attempt.studentId, score, exam.questions.length]
      );
    }

    const [updatedRows] = await connection.execute(
      'SELECT * FROM exam_attempts WHERE id = ?',
      [attempt.id]
    );
    const updatedAttempt = toCamelCase(updatedRows[0]);
    updatedAttempt.Exam = exam;
    await connection.commit();
    res.json({ message: 'Exam submitted', attempt: updatedAttempt });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
};
