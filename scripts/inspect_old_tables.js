require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  });

  // Cek inventory_requests
  const [cols1] = await conn.query('DESCRIBE inventory_requests');
  console.log('\n=== inventory_requests ===');
  cols1.forEach(c => console.log(`  ${c.Field} | ${c.Type} | NULL:${c.Null} | Default:${c.Default}`));

  // Cek inventory_request_details
  const [cols2] = await conn.query('DESCRIBE inventory_request_details');
  console.log('\n=== inventory_request_details ===');
  cols2.forEach(c => console.log(`  ${c.Field} | ${c.Type} | NULL:${c.Null} | Default:${c.Default}`));

  // Sample data
  try {
    const [rows] = await conn.query('SELECT * FROM inventory_requests LIMIT 3');
    console.log('\nSample inventory_requests:', JSON.stringify(rows, null, 2));
  } catch(e) {
    console.log('Error:', e.message);
  }

  await conn.end();
})();
