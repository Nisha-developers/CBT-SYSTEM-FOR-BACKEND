const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { toCamelCase } = require('../database/sql');

const studentColumns = `
  id, full_name, admission_number, gender, date_of_birth,
  school_id, class_id, arm_id, created_at, updated_at
`;

exports.listStudents = async (req, res, next) => {
  try {
    const { classId, armId } = req.query;
    let sql = `SELECT ${studentColumns} FROM students WHERE school_id = ?`;
    const values = [req.user.schoolId];
    if (classId) {
      sql += ' AND class_id = ?';
      values.push(classId);
    }
    if (armId) {
      sql += ' AND arm_id = ?';
      values.push(armId);
    }
    const [rows] = await db.execute(sql, values);
    res.json({ students: rows.map(toCamelCase) });
  } catch (err) {
    next(err);
  }
};

exports.addStudent = async (req, res, next) => {
  try {
    const { fullName, admissionNumber, classId, armId, gender, dateOfBirth, password } = req.body;
    const passwordHash = await bcrypt.hash(password || admissionNumber, 10);
    const [result] = await db.execute(
      `INSERT INTO students
        (full_name, admission_number, gender, date_of_birth, password_hash, school_id, class_id, arm_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullName,
        admissionNumber,
        gender || null,
        dateOfBirth || null,
        passwordHash,
        req.user.schoolId,
        classId,
        armId,
      ]
    );
    const [rows] = await db.execute(
      `SELECT ${studentColumns} FROM students WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json({ student: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.getStudent = async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT ${studentColumns} FROM students WHERE id = ? AND school_id = ? LIMIT 1`,
      [req.params.id, req.user.schoolId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Student not found' });
    res.json({ student: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.updateStudent = async (req, res, next) => {
  try {
    const fields = {
      fullName: 'full_name',
      admissionNumber: 'admission_number',
      classId: 'class_id',
      armId: 'arm_id',
      gender: 'gender',
      dateOfBirth: 'date_of_birth',
    };
    const updates = Object.entries(fields).filter(([key]) => req.body[key] !== undefined);
    if (updates.length) {
      const assignments = updates.map(([, column]) => `\`${column}\` = ?`).join(', ');
      const values = updates.map(([key]) => req.body[key]);
      const [result] = await db.execute(
        `UPDATE students SET ${assignments} WHERE id = ? AND school_id = ?`,
        [...values, req.params.id, req.user.schoolId]
      );
      if (!result.affectedRows) {
        const [existing] = await db.execute(
          'SELECT id FROM students WHERE id = ? AND school_id = ?',
          [req.params.id, req.user.schoolId]
        );
        if (!existing.length) return res.status(404).json({ message: 'Student not found' });
      }
    }
    const [rows] = await db.execute(
      `SELECT ${studentColumns} FROM students WHERE id = ? AND school_id = ? LIMIT 1`,
      [req.params.id, req.user.schoolId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Student not found' });
    res.json({ student: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.deleteStudent = async (req, res, next) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM students WHERE id = ? AND school_id = ?',
      [req.params.id, req.user.schoolId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Student not found' });
    res.json({ message: 'Student removed' });
  } catch (err) {
    next(err);
  }
};
