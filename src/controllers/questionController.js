const fs = require('fs');
const { extractQuestionsFromFile } = require('../services/aiQuestionExtractionService');
const db = require('../config/db');
const { toCamelCase } = require('../database/sql');

exports.importQuestions = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const extracted = await extractQuestionsFromFile(req.file.path, req.file.mimetype);
    fs.unlink(req.file.path, () => {});
    res.json({ preview: extracted });
  } catch (err) {
    next(err);
  }
};

exports.confirmImportedQuestions = async (req, res, next) => {
  let connection;
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ message: 'questions must be an array' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const ids = [];
    for (const question of questions) {
      const [result] = await connection.execute(
        `INSERT INTO questions (exam_id, text, options, correct_option, needs_review)
         VALUES (?, ?, ?, ?, FALSE)`,
        [
          req.params.id,
          question.text,
          question.options == null ? null : JSON.stringify(question.options),
          question.correctOption || null,
        ]
      );
      ids.push(result.insertId);
    }
    if (questions.length) {
      await connection.execute(
        'UPDATE exams SET total_questions = total_questions + ? WHERE id = ?',
        [questions.length, req.params.id]
      );
    }
    let created = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(', ');
      const [rows] = await connection.execute(
        `SELECT * FROM questions WHERE id IN (${placeholders}) ORDER BY id`,
        ids
      );
      created = rows.map(toCamelCase);
    }
    await connection.commit();
    res.status(201).json({ questions: created });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
};
