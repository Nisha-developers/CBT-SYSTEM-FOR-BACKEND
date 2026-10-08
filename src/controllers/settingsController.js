const db = require('../config/db');
const { toCamelCase } = require('../database/sql');

exports.addArm = async (req, res, next) => {
  try {
    const { name, classId } = req.body;
    const [result] = await db.execute(
      'INSERT INTO arms (name, class_id, school_id) VALUES (?, ?, ?)',
      [name, classId, req.user.schoolId]
    );
    const [rows] = await db.execute('SELECT * FROM arms WHERE id = ?', [result.insertId]);
    res.status(201).json({ arm: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.updateArm = async (req, res, next) => {
  try {
    const updates = [];
    const values = [];
    if (req.body.name !== undefined) {
      updates.push('name = ?');
      values.push(req.body.name);
    }
    if (req.body.classId !== undefined) {
      updates.push('class_id = ?');
      values.push(req.body.classId);
    }
    if (updates.length) {
      const [result] = await db.execute(
        `UPDATE arms SET ${updates.join(', ')} WHERE id = ? AND school_id = ?`,
        [...values, req.params.id, req.user.schoolId]
      );
      if (!result.affectedRows) {
        const [rows] = await db.execute(
          'SELECT id FROM arms WHERE id = ? AND school_id = ?',
          [req.params.id, req.user.schoolId]
        );
        if (!rows.length) return res.status(404).json({ message: 'Arm not found' });
      }
    }
    const [rows] = await db.execute(
      'SELECT * FROM arms WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, req.user.schoolId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Arm not found' });
    res.json({ arm: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.deleteArm = async (req, res, next) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM arms WHERE id = ? AND school_id = ?',
      [req.params.id, req.user.schoolId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Arm not found' });
    res.json({ message: 'Arm removed' });
  } catch (err) {
    next(err);
  }
};

exports.addSubject = async (req, res, next) => {
  try {
    const [result] = await db.execute(
      'INSERT INTO subjects (name, school_id) VALUES (?, ?)',
      [req.body.name, req.user.schoolId]
    );
    const [rows] = await db.execute('SELECT * FROM subjects WHERE id = ?', [result.insertId]);
    res.status(201).json({ subject: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.updateSubject = async (req, res, next) => {
  try {
    if (req.body.name !== undefined) {
      const [result] = await db.execute(
        'UPDATE subjects SET name = ? WHERE id = ? AND school_id = ?',
        [req.body.name, req.params.id, req.user.schoolId]
      );
      if (!result.affectedRows) {
        const [rows] = await db.execute(
          'SELECT id FROM subjects WHERE id = ? AND school_id = ?',
          [req.params.id, req.user.schoolId]
        );
        if (!rows.length) return res.status(404).json({ message: 'Subject not found' });
      }
    }
    const [rows] = await db.execute(
      'SELECT * FROM subjects WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, req.user.schoolId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Subject not found' });
    res.json({ subject: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.deleteSubject = async (req, res, next) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM subjects WHERE id = ? AND school_id = ?',
      [req.params.id, req.user.schoolId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Subject not found' });
    res.json({ message: 'Subject removed' });
  } catch (err) {
    next(err);
  }
};

exports.addClass = async (req, res, next) => {
  try {
    const [result] = await db.execute(
      'INSERT INTO classes (name, school_id) VALUES (?, ?)',
      [req.body.name, req.user.schoolId]
    );
    const [rows] = await db.execute('SELECT * FROM classes WHERE id = ?', [result.insertId]);
    res.status(201).json({ class: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};
