const pool = require('../config/db');

const db = (conn) => conn || pool;

async function findSessionId(name, conn) {
  const [rows] = await db(conn).execute('SELECT id FROM academic_sessions WHERE name = ?', [name]);
  return rows[0]?.id || null;
}
async function insertSession(name, conn) {
  const [r] = await db(conn).execute('INSERT INTO academic_sessions (name) VALUES (?)', [name]);
  return r.insertId;
}
async function findTermId(sessionId, name, conn) {
  const [rows] = await db(conn).execute(
    'SELECT id FROM terms WHERE academic_session_id = ? AND name = ?', [sessionId, name]);
  return rows[0]?.id || null;
}
async function insertTerm(sessionId, name, conn) {
  const [r] = await db(conn).execute('INSERT INTO terms (name, academic_session_id) VALUES (?, ?)', [name, sessionId]);
  return r.insertId;
}
async function setCurrent(termId, conn) {
  const c = db(conn);
  await c.execute('UPDATE terms SET is_current = FALSE WHERE is_current = TRUE');
  await c.execute('UPDATE terms SET is_current = TRUE WHERE id = ?', [termId]);
}

const TERM_JOIN = `SELECT t.id, t.name AS term, s.id AS session_id, s.name AS session
                     FROM terms t JOIN academic_sessions s ON s.id = t.academic_session_id`;

async function findCurrent(conn) {
  const [rows] = await db(conn).query(`${TERM_JOIN} WHERE t.is_current = TRUE LIMIT 1`);
  return rows[0] || null;
}
async function findByNames(sessionName, termName) {
  const [rows] = await pool.execute(`${TERM_JOIN} WHERE s.name = ? AND t.name = ?`, [sessionName, termName]);
  return rows[0] || null;
}
async function findPreviousId(termId) {
  const [rows] = await pool.execute('SELECT id FROM terms WHERE id < ? ORDER BY id DESC LIMIT 1', [termId]);
  return rows[0]?.id || null;
}
async function findInfo(termId) {
  const [rows] = await pool.execute(`${TERM_JOIN} WHERE t.id = ?`, [termId]);
  return rows[0] || null;
}
async function listSessionsWithTerms() {
  const [rows] = await pool.query(
    `SELECT s.id AS session_id, s.name AS session, t.id AS term_id, t.name AS term, t.is_current
       FROM academic_sessions s LEFT JOIN terms t ON t.academic_session_id = s.id
      ORDER BY s.name DESC, t.name`);
  return rows;
}

module.exports = {
  findSessionId, insertSession, findTermId, insertTerm, setCurrent, findCurrent,
  findByNames, findPreviousId, findInfo, listSessionsWithTerms,
};
