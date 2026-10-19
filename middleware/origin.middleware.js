const env = require('../config/env');
const { forbidden } = require('../utils/errors');

// Cookie-authenticated endpoints (refresh / logout) must come from our own frontend.
// Browsers always send Origin on cross-site POSTs, so a foreign site can't trigger them.
const requireTrustedOrigin = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !env.CLIENT_ORIGIN.includes(origin)) return next(forbidden('Untrusted origin'));
  return next();
};

module.exports = { requireTrustedOrigin };
