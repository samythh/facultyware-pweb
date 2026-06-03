const mysql = require('mysql2');
require('dotenv').config();

async function run() {
  const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  }).promise();

  try {
    const [descSessions] = await connection.query('DESCRIBE sessions');
    console.log('sessions schema:', descSessions.map(c => ({ Field: c.Field, Type: c.Type })));
  } catch (error) {
    console.error(error);
  } finally {
    await connection.end();
  }
}

run();
