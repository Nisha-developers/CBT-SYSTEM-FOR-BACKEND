const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { sha256 } = require('../utils/hash');
const { readRefreshCookie } = require('../utils/cookies');

const tooMany = (text) => ({ success: false, message: text });
const base = { standardHeaders: true, legacyHeaders: false };
const ip = (req) => ipKeyGenerator(req.ip);

// Wrong-password attempts only (successful logins don't count). Keyed per ACCOUNT + IP, so one
// student's typos can't lock out a whole school that shares a single public IP.
const identity = (req) => String(req.body?.emailOrUsername || req.body?.admissionNumber || '').toLowerCase().slice(0, 100);

const loginLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, limit: 5, skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ip(req)}|${identity(req)}`,
  message: tooMany('Too many failed attempts. Try again in 15 minutes.'),
});

// Broad backstop per IP against someone trying thousands of different accounts.
const loginIpLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, limit: 300, skipSuccessfulRequests: true,
  keyGenerator: ip, message: tooMany('Too many failed attempts from this network. Try again later.'),
});

const signupLimiter = rateLimit({
  ...base, windowMs: 60 * 60 * 1000, limit: 10, keyGenerator: ip,
  message: tooMany('Too many sign-up attempts. Try again later.'),
});

// Per session (hash of the cookie) — a healthy session refreshes about every 15 minutes.
const refreshLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, limit: 30,
  keyGenerator: (req) => `${ip(req)}|${sha256(readRefreshCookie(req) || 'none').slice(0, 16)}`,
  message: tooMany('Too many session refreshes. Please log in again.'),
});

// Question-import uploads are CPU heavy.
const uploadLimiter = rateLimit({
  ...base, windowMs: 60 * 60 * 1000, limit: 40,
  keyGenerator: (req) => `u${req.user?.id || ip(req)}`, message: tooMany('Too many uploads. Try again later.'),
});

module.exports = { loginLimiter, loginIpLimiter, signupLimiter, refreshLimiter, uploadLimiter };
