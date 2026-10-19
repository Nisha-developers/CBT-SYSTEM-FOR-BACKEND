const crypto = require('crypto');
const { signAccessToken, signRefreshToken, verifyRefreshToken, expiryOf } = require('../utils/jwt');
const { sha256 } = require('../utils/hash');
const { unauthorized } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const refreshTokenModel = require('../models/refreshToken.model');
const adminModel = require('../models/admin.model');
const studentModel = require('../models/student.model');
const { ROLES } = require('../constants');

// A token presented again right after it was rotated is almost always a duplicate request
// (two tabs, a retry) — not theft. Beyond this window, re-use means the old token leaked.
const REUSE_GRACE_MS = 10_000;
const EXPIRED = 'Session expired. Please log in again.';

// The live account behind a token subject (null if deleted / deactivated).
async function loadSubject(type, uid) {
  if (type === 'admin') {
    const a = await adminModel.findAuthByUid(uid);
    return a && a.status === 'active' ? { type: 'admin', id: a.id, uid: a.uid, role: a.role } : null;
  }
  if (type === 'student') {
    const s = await studentModel.findAuthByUid(uid);
    return s ? { type: 'student', id: s.id, uid: s.uid, role: ROLES.STUDENT } : null;
  }
  return null;
}

// New access + refresh token. The refresh token is stored (hashed) so it can be rotated and revoked.
async function createSession(subject, meta = {}, { familyId = crypto.randomUUID(), conn } = {}) {
  const refreshToken = signRefreshToken({ sub: subject.uid, type: subject.type, fid: familyId });
  await refreshTokenModel.insert({
    tokenHash: sha256(refreshToken), familyId, subjectType: subject.type, subjectId: subject.id,
    expiresAt: expiryOf(refreshToken), userAgent: (meta.userAgent || '').slice(0, 255), ip: meta.ip,
  }, conn);
  const accessToken = signAccessToken({ sub: subject.uid, type: subject.type, role: subject.role, fid: familyId });
  return { accessToken, refreshToken };
}

// Trade a refresh token for a fresh pair (rotation). Throws 401 on anything suspicious.
async function rotate(refreshToken, meta = {}) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized(EXPIRED);
  }

  const hash = sha256(refreshToken);
  const stored = await refreshTokenModel.findByHash(hash);
  if (!stored) throw unauthorized(EXPIRED);

  if (stored.revoked_at) {
    const justRotated = Date.now() - new Date(stored.revoked_at).getTime() < REUSE_GRACE_MS;
    if (!justRotated) await refreshTokenModel.revokeFamily(stored.family_id);   // reuse detected → kill the session
    throw unauthorized(EXPIRED);
  }

  const subject = await loadSubject(payload.type, payload.sub);
  if (!subject) {
    await refreshTokenModel.revokeFamily(stored.family_id);
    throw unauthorized(EXPIRED);
  }

  return withTransaction(async (conn) => {
    const locked = await refreshTokenModel.findByHash(hash, conn, { lock: true });
    if (!locked || locked.revoked_at) throw unauthorized(EXPIRED);
    const tokens = await createSession(subject, meta, { familyId: stored.family_id, conn });
    await refreshTokenModel.revoke(locked.id, sha256(tokens.refreshToken), conn);
    return { ...tokens, subject };
  });
}

// Log out this browser: revoke the whole token family (the stored hash is proof the token is ours).
async function revokeByToken(refreshToken) {
  const stored = await refreshTokenModel.findByHash(sha256(refreshToken));
  if (stored) await refreshTokenModel.revokeFamily(stored.family_id);
}

const revokeAllForSubject = (type, id, exceptFamilyId) => refreshTokenModel.revokeAllForSubject(type, id, exceptFamilyId);
const purgeExpired = () => refreshTokenModel.deleteExpired();

module.exports = { createSession, rotate, revokeByToken, revokeAllForSubject, purgeExpired };
