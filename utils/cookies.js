const env = require('../config/env');

const REFRESH_COOKIE = 'cbt_rt';

// The refresh token never touches JavaScript: httpOnly + SameSite, and only sent to /api/auth.
const baseOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/auth',
});

const setRefreshCookie = (res, token) =>
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(), maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 });

const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, baseOptions());

const readRefreshCookie = (req) => {
  const v = req.cookies?.[REFRESH_COOKIE];
  return typeof v === 'string' && v.length < 2048 ? v : null;
};

module.exports = { REFRESH_COOKIE, setRefreshCookie, clearRefreshCookie, readRefreshCookie };
