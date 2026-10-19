const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: ['DATE'],   // DATE → 'YYYY-MM-DD' strings (no timezone drift)
  timezone: 'Z',           // DATETIME/TIMESTAMP are UTC
  decimalNumbers: true,
});

// Keep MySQL's own NOW() in UTC to match `timezone: 'Z'`.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

module.exports = pool;
