const pool = require('../config/db');

const db = (conn) => conn || pool;

async function insert({ adminId, type, activity, description }, conn) {
  await db(conn).execute(
    'INSERT INTO activities (admin_id, type, activity, description) VALUES (?, ?, ?, ?)',
    [adminId || null, type, activity, description || null]);
}

async function list({ adminId, limit, offset }) {
  const where = adminId ? 'WHERE a.admin_id = ?' : '';
  const params = adminId ? [adminId, limit, offset] : [limit, offset];
  const [rows] = await pool.query(
    `SELECT a.id, a.type, a.activity, a.description, a.created_at, ad.full_name AS admin_name
       FROM activities a LEFT JOIN admin ad ON ad.id = a.admin_id
       ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`, params);
  return rows;
}

async function count(adminId) {
  const [rows] = adminId
    ? await pool.query('SELECT COUNT(*) AS c FROM activities WHERE admin_id = ?', [adminId])
    : await pool.query('SELECT COUNT(*) AS c FROM activities');
  return rows[0].c;
}

module.exports = { insert, list, count };
