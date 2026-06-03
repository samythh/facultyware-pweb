const mysql = require('mysql2');
require('dotenv').config();

async function run() {
  const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    multipleStatements: true
  }).promise();

  try {
    console.log('Dropping views if they exist...');
    await connection.query('DROP VIEW IF EXISTS permintaan_pengadaan');
    await connection.query('DROP VIEW IF EXISTS permintaan_items');

    console.log('Creating tables permintaan_pengadaan and permintaan_items...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS permintaan_pengadaan (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        request_number VARCHAR(255) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        status ENUM('draft', 'submitted', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
        created_by BIGINT UNSIGNED NOT NULL,
        approved_at TIMESTAMP NULL,
        employee_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL,
        updated_at TIMESTAMP NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS permintaan_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        permintaan_pengadaan_id BIGINT UNSIGNED NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        created_at TIMESTAMP NULL,
        updated_at TIMESTAMP NULL,
        FOREIGN KEY (permintaan_pengadaan_id) REFERENCES permintaan_pengadaan(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Tables created successfully!');
  } catch (error) {
    console.error('Error setting up tables:', error);
  } finally {
    await connection.end();
  }
}

run();
