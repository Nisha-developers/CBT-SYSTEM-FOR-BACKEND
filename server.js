const env = require('./config/env');
const db = require('./config/db');
const app = require('./app');
const tokenService = require('./services/token.service');

const HOUR = 60 * 60 * 1000;


(async () => {
  try {
    (await db.getConnection()).release();
    console.log('MySQL connected');
  } catch (err) {
    console.error('Failed to connect to MySQL:', err.message);
    process.exit(1);
  }

  // housekeeping: drop expired / long-revoked refresh tokens
  const purge = () => tokenService.purgeExpired().catch((e) => console.error('Token cleanup failed:', e.message));
  purge();
  setInterval(purge, HOUR).unref();

  app.listen(env.PORT, () => console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`));
})();
