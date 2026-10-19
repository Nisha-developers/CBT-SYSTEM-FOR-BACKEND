const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

const ISSUER = 'cbt-api';
const AUDIENCE = 'cbt-app';
const ALG = 'HS256';


// ---- access token: short-lived, kept in memory by the browser ----
const signAccessToken = ({ sub, type, role, fid }) =>
  jwt.sign({ type, role, fid }, env.ACCESS_TOKEN_SECRET, {
    algorithm: ALG, expiresIn: env.ACCESS_TOKEN_TTL, subject: sub, issuer: ISSUER, audience: AUDIENCE,
  });

const verifyAccessToken = (token) =>
  jwt.verify(token, env.ACCESS_TOKEN_SECRET, { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });

// ---- refresh token: long-lived, httpOnly cookie, rotated on every use ----
const signRefreshToken = ({ sub, type, fid }) =>
  jwt.sign({ type, fid }, env.REFRESH_TOKEN_SECRET, {
    algorithm: ALG, expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`, subject: sub, issuer: ISSUER,
    audience: AUDIENCE, jwtid: crypto.randomUUID(),
  });

const verifyRefreshToken = (token) =>
  jwt.verify(token, env.REFRESH_TOKEN_SECRET, { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });

// Expiry (as a Date) of a token we just signed.
const expiryOf = (token) => new Date(jwt.decode(token).exp * 1000);

module.exports = { expiryOf, signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken };
