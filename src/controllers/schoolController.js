const db = require('../config/db');
const { toCamelCase } = require('../database/sql');

exports.setupSchool = async (req, res, next) => {
  let connection;
  try {
    const { name, motto, logoUrl, address, phone, email, classes, arms, subjects } = req.body;
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.execute('SELECT id FROM schools LIMIT 1 FOR UPDATE');
    if (existing.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'A school is already registered.' });
    }

    const [schoolResult] = await connection.execute(
      `INSERT INTO schools (name, motto, logo_url, address, phone, email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, motto || null, logoUrl || null, address || null, phone || null, email || null]
    );
    const school = toCamelCase({
      id: schoolResult.insertId,
      name,
      motto: motto || null,
      logo_url: logoUrl || null,
      address: address || null,
      phone: phone || null,
      email: email || null,
    });

    const createdClasses = new Map();
    for (const className of classes || []) {
      const [result] = await connection.execute(
        'INSERT INTO classes (name, school_id) VALUES (?, ?)',
        [className, school.id]
      );
      createdClasses.set(className, result.insertId);
    }

    for (const armGroup of arms || []) {
      const classId = createdClasses.get(armGroup.className);
      if (!classId) continue;
      for (const armName of armGroup.armNames || []) {
        await connection.execute(
          'INSERT INTO arms (name, class_id, school_id) VALUES (?, ?, ?)',
          [armName, classId, school.id]
        );
      }
    }

    for (const subjectName of subjects || []) {
      await connection.execute(
        'INSERT INTO subjects (name, school_id) VALUES (?, ?)',
        [subjectName, school.id]
      );
    }

    await connection.commit();
    res.status(201).json({ school });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
};

exports.getSchool = async (req, res, next) => {
  try {
    const [schoolRows] = await db.execute('SELECT * FROM schools WHERE id = ? LIMIT 1', [req.user.schoolId]);
    if (!schoolRows.length) return res.json({ school: null });

    const [classRows] = await db.execute('SELECT * FROM classes WHERE school_id = ?', [req.user.schoolId]);
    const [armRows] = await db.execute('SELECT * FROM arms WHERE school_id = ?', [req.user.schoolId]);
    const [subjectRows] = await db.execute('SELECT * FROM subjects WHERE school_id = ?', [req.user.schoolId]);
    const school = toCamelCase(schoolRows[0]);
    school.SchoolClasses = classRows.map(toCamelCase);
    school.Arms = armRows.map(toCamelCase);
    school.Subjects = subjectRows.map(toCamelCase);
    res.json({ school });
  } catch (err) {
    next(err);
  }
};

exports.updateSchool = async (req, res, next) => {
  try {
    const fields = {
      name: 'name',
      motto: 'motto',
      logoUrl: 'logo_url',
      address: 'address',
      phone: 'phone',
      email: 'email',
    };
    const updates = Object.entries(fields).filter(([key]) => req.body[key] !== undefined);
    if (updates.length) {
      const assignments = updates.map(([, column]) => `\`${column}\` = ?`).join(', ');
      const values = updates.map(([key]) => req.body[key]);
      const [result] = await db.execute(
        `UPDATE schools SET ${assignments} WHERE id = ?`,
        [...values, req.user.schoolId]
      );
      if (!result.affectedRows) return res.status(404).json({ message: 'School not found' });
    }

    const [rows] = await db.execute('SELECT * FROM schools WHERE id = ? LIMIT 1', [req.user.schoolId]);
    if (!rows.length) return res.status(404).json({ message: 'School not found' });
    res.json({ school: toCamelCase(rows[0]) });
  } catch (err) {
    next(err);
  }
};

exports.deleteSchool = async (req, res, next) => {
  try {
    if (req.body.confirm !== 'DELETE') {
      return res.status(400).json({ message: 'Type DELETE to confirm this action.' });
    }
    const [result] = await db.execute('DELETE FROM schools WHERE id = ?', [req.user.schoolId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'School not found' });
    res.json({ message: 'School and all associated data deleted.' });
  } catch (err) {
    next(err);
  }
};
