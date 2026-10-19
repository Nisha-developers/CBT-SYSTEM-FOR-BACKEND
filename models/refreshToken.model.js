const pool = require('../config/db');

const COLS = 'id, token_hash, family_id, subject_type, subject_id, expires_at, revoked_at';
const db = (conn) => conn || pool;

async function insert({ tokenHash, familyId, subjectType, subjectId, expiresAt, userAgent, ip }, conn) {
  await db(conn).execute(
    `INSERT INTO refresh_tokens (token_hash, family_id, subject_type, subject_id, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tokenHash, familyId, subjectType, subjectId, expiresAt, userAgent || null, ip || null]
  );
}

async function findByHash(tokenHash, conn, { lock = false } = {}) {
  const [rows] = await db(conn).execute(
    `SELECT ${COLS} FROM refresh_tokens WHERE token_hash = ? ${lock ? 'FOR UPDATE' : ''}`, [tokenHash]);
  return rows[0] || null;
}

// Mark a token used; `replacedByHash` links it to its successor (rotation).
async function revoke(id, replacedByHash, conn) {
  await db(conn).execute(
    'UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_hash = ? WHERE id = ? AND revoked_at IS NULL',
    [replacedByHash || null, id]);
}

async function revokeFamily(familyId, conn) {
  await db(conn).execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL', [familyId]);
}

// Sign a user out everywhere (optionally keeping one session alive).
async function revokeAllForSubject(subjectType, subjectId, exceptFamilyId, conn) {
  await db(conn).execute(
    `UPDATE refresh_tokens SET revoked_at = NOW()
      WHERE subject_type = ? AND subject_id = ? AND revoked_at IS NULL AND family_id <> ?`,
    [subjectType, subjectId, exceptFamilyId || '']);
}

async function deleteExpired() {
  const [r] = await pool.execute('DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at < (NOW() - INTERVAL 1 DAY)');
  return r.affectedRows;
}

module.exports = { insert, findByHash, revoke, revokeFamily, revokeAllForSubject, deleteExpired };
