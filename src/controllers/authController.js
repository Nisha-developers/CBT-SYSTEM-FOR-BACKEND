const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { toCamelCase } = require('../database/sql');
const { signToken } = require('../utils/jwt');

exports.adminSignup = async (req, res, next) => {
  try {
    const { fullName, email, username, password, schoolId } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      `INSERT INTO admins (full_name, email, username, password_hash, role, school_id)
       VALUES (?, ?, ?, ?, 'admin', ?)`,
      [fullName, email, username, passwordHash, schoolId]
    );
    const [[row]] = await db.execute(
      'SELECT id, full_name, email, username, role, school_id FROM admins WHERE id = ?',
      [result.insertId]
    );
    const admin = toCamelCase(row);
    const token = signToken({ id: admin.id, role: admin.role, schoolId: admin.schoolId });
    res.status(201).json({
      token,
      admin: { id: admin.id, fullName: admin.fullName, email: admin.email, username: admin.username },
    });
  } catch (err) {
    next(err);
  }
};

exports.adminLogin = async (req, res, next) => {
  try {
    const { emailOrUsername, password } = req.body;
    const [rows] = await db.execute(
      `SELECT id, full_name, email, username, password_hash, role, school_id
       FROM admins WHERE email = ? OR username = ? LIMIT 1`,
      [emailOrUsername, emailOrUsername]
    );
    const admin = toCamelCase(rows[0]);
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken({ id: admin.id, role: admin.role, schoolId: admin.schoolId });
    res.json({ token, admin: { id: admin.id, fullName: admin.fullName, email: admin.email } });
  } catch (err) {
    next(err);
  }
};

exports.studentLogin = async (req, res, next) => {
  try {
    const { admissionNumber, password } = req.body;
    const [rows] = await db.execute(
      `SELECT id, full_name, password_hash, school_id
       FROM students WHERE admission_number = ? LIMIT 1`,
      [admissionNumber]
    );
    const student = toCamelCase(rows[0]);
    if (!student || !(await bcrypt.compare(password, student.passwordHash))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken({ id: student.id, role: 'student', schoolId: student.schoolId });
    res.json({ token, student: { id: student.id, fullName: student.fullName } });
  } catch (err) {
    next(err);
  }
};
