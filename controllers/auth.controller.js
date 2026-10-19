const authService = require('../services/auth.service');
const { ok, created, message } = require('../utils/response');
const { setRefreshCookie, clearRefreshCookie, readRefreshCookie } = require('../utils/cookies');

const metaOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

// The refresh token goes into an httpOnly cookie; only the short-lived access token and the
// user profile are returned in the body (the browser keeps them in memory, never in storage).
const startSession = (res, { accessToken, refreshToken, user }, status = 200) => {
  setRefreshCookie(res, refreshToken);
  return (status === 201 ? created : ok)(res, { accessToken, user });
};

const adminSignup = async (req, res) => startSession(res, await authService.adminSignup(req.valid.body, metaOf(req)), 201);
const adminLogin = async (req, res) => startSession(res, await authService.adminLogin(req.valid.body, metaOf(req)));
const studentLogin = async (req, res) => startSession(res, await authService.studentLogin(req.valid.body, metaOf(req)));

// Silent renewal: trade the cookie for a new access token (and a new, rotated cookie).
const refresh = async (req, res) => {
  try {
    return startSession(res, await authService.refresh(readRefreshCookie(req), metaOf(req)));
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
};

const logout = async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  return message(res, 'Logged out');
};

const logoutEverywhere = async (req, res) => {
  await authService.logoutEverywhere(req.user);
  clearRefreshCookie(res);
  return message(res, 'Logged out of all devices');
};

const changePassword = async (req, res) => {
  await authService.changeStudentPassword(req.user, req.valid.body);
  return message(res, 'Password changed successfully');
};

const me = async (req, res) => ok(res, { user: await authService.me(req.user) });

module.exports = { adminSignup, adminLogin, studentLogin, refresh, logout, logoutEverywhere, changePassword, me };
