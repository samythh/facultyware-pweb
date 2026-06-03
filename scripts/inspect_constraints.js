const mysql = require('mysql2');
require('dotenv').config();

async function run() {
  const mysql2 = require('mysql2/promise');
  const connection = await mysql2.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  });

  try {
    const [fks] = await connection.query(`
      SELECT 
        TABLE_NAME, 
        COLUMN_NAME, 
        CONSTRAINT_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME
      FROM 
        INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE 
        TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
        AND TABLE_NAME IN ('inventory_procurements', 'inventory_procurement_items')
    `, [process.env.DB_NAME]);
    console.log('Foreign Keys:', fks);

    const [empCount] = await connection.query('SELECT COUNT(*) FROM employees');
    console.log('Employees count:', empCount);

    if (empCount[0]['COUNT(*)'] > 0) {
      const [emp] = await connection.query('SELECT * FROM employees LIMIT 1');
      console.log('Sample Employee:', emp);
    }
  } catch (error) {
    console.error(error);
  } finally {
    await connection.end();
  }
}

run();
