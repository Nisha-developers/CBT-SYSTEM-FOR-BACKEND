const pool = require('../config/db');

const COLS = 'id, uid, full_name, username, email, role, status, last_login, created_at';
const db = (conn) => conn || pool;

async function findAll() {
  const [rows] = await pool.query(`SELECT ${COLS} FROM admin ORDER BY created_at`);
  return rows;
}

async function findByUid(uid, conn, { lock = false } = {}) {
  const [rows] = await db(conn).execute(`SELECT ${COLS} FROM admin WHERE uid = ? ${lock ? 'FOR UPDATE' : ''}`, [uid]);
  return rows[0] || null;
}

// What the auth middleware needs on every request.
async function findAuthById(id) {
  const [rows] = await pool.execute('SELECT id, uid, role, status FROM admin WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findAuthByUid(uid) {
  const [rows] = await pool.execute('SELECT id, uid, role, status FROM admin WHERE uid = ?', [uid]);
  return rows[0] || null;
}

async function findForLogin(identifier) {
  const [rows] = await pool.execute(
    `SELECT id, uid, full_name, username, email, role, status, password_hash
       FROM admin WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1`, [identifier, identifier]);
  return rows[0] || null;
}

async function exists(conn) {
  const [rows] = await db(conn).query('SELECT COUNT(*) AS c FROM admin');
  return rows[0].c > 0;
}

async function usernameTaken(username, conn) {
  const [rows] = await db(conn).execute('SELECT id FROM admin WHERE LOWER(username) = ?', [username.toLowerCase()]);
  return rows.length > 0;
}

async function insert({ uid, fullName, username, email, passwordHash, role }, conn) {
  const [r] = await db(conn).execute(
    'INSERT INTO admin (uid, full_name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
    [uid, fullName, username, email, passwordHash, role]);
  return r.insertId;
}

async function update(id, { fullName, email, role, status, passwordHash }, conn) {
  const sets = ['full_name = ?', 'email = ?', 'role = ?', 'status = ?'];
  const params = [fullName, email, role, status];
  if (passwordHash) { sets.push('password_hash = ?'); params.push(passwordHash); }
  await db(conn).execute(`UPDATE admin SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

async function remove(id, conn) {
  await db(conn).execute('DELETE FROM admin WHERE id = ?', [id]);
}

async function touchLastLogin(id) {
  await pool.execute('UPDATE admin SET last_login = NOW() WHERE id = ?', [id]);
}

async function countOtherActiveSuperAdmins(id, conn) {
  const [rows] = await db(conn).execute(
    "SELECT COUNT(*) AS c FROM admin WHERE role = 'super_admin' AND status = 'active' AND id <> ?", [id]);
  return rows[0].c;
}

module.exports = {
  findAll, findByUid, findAuthById, findAuthByUid, findForLogin, exists, usernameTaken,
  insert, update, remove, touchLastLogin, countOtherActiveSuperAdmins,
};
