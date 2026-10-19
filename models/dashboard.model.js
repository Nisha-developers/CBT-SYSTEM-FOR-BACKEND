const pool = require('../config/db');

async function studentCounts() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')), 0) AS this_month FROM students`);
  return { total: Number(row.total), thisMonth: Number(row.this_month) };
}

async function subjectCount() {
  const [[row]] = await pool.query(
    'SELECT (SELECT COUNT(*) FROM subjects) + (SELECT COUNT(*) FROM optional_subjects) AS total');
  return Number(row.total);
}

async function classArmsWithClass() {
  const [rows] = await pool.query(
    `SELECT ca.class_arm_id, c.class_id, c.class_name FROM class_arm ca
       JOIN class c ON c.class_id = ca.class_id ORDER BY c.class_id, ca.class_arm_id`);
  return rows;
}

module.exports = { studentCounts, subjectCount, classArmsWithClass };
