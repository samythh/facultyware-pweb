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
    console.log('Creating views permintaan_pengadaan and permintaan_items...');
    await connection.query('CREATE OR REPLACE VIEW permintaan_pengadaan AS SELECT * FROM inventory_procurements');
    await connection.query('CREATE OR REPLACE VIEW permintaan_items AS SELECT * FROM inventory_procurement_items');
    console.log('Views created successfully!');
  } catch (error) {
    console.error('Error creating views:', error);
  } finally {
    await connection.end();
  }
}

run();
