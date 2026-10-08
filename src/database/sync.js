require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function syncDatabase() {
  const database = process.env.DB_NAME || 'cbt_school_system';
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error('DB_NAME may contain only letters, numbers, and underscores');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${database}\``);
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8').replace(/^\s*--.*$/gm, '');
    const statements = schema
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement && !/^CREATE DATABASE\b/i.test(statement) && !/^USE\b/i.test(statement));

    for (const statement of statements) {
      await connection.query(statement);
    }
    console.log(`Database schema ready: ${database}`);
  } finally {
    await connection.end();
  }
}

syncDatabase().catch((error) => {
  console.error('Unable to initialize database:', error);
  process.exitCode = 1;
});
