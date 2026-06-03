const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
  try {
    const connection = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 3306,
      multipleStatements: true
    }).promise();

    console.log('Connected to MySQL. Creating database if not exists...');
    await connection.query('CREATE DATABASE IF NOT EXISTS facultyware CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await connection.query('USE facultyware');

    const sqlPath = 'C:/Users/USER/Downloads/db_tb_pweb_v2.sql';
    console.log('Reading SQL file:', sqlPath);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Importing SQL contents (this might take a few seconds)...');
    await connection.query(sql);
    console.log('Import successful!');

    const [tables] = await connection.query('SHOW TABLES');
    console.log('Tables in facultyware:', tables.map(t => Object.values(t)[0]));

    await connection.end();
  } catch (error) {
    console.error('Error importing database:', error);
  }
}

run();
