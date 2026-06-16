const mysql = require('mysql2');
require('dotenv').config();

async function check() {
  try {
    const connection = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306
    }).promise();

    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('Tables:', JSON.stringify(tableNames, null, 2));

    await connection.end();
  } catch (error) {
    console.error('Error connecting to DB:', error);
  }
}

check();
