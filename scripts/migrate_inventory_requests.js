/**
 * Script ALTER: Sesuaikan tabel inventory_requests dengan kebutuhan Nadila (Pengadaan)
 * - Tambah kolom 'title' jika belum ada
 * - Tambah kolom 'submitted' ke ENUM status
 * - Tambah kolom 'created_by' jika belum ada
 *
 * Jalankan: node scripts/migrate_inventory_requests.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    multipleStatements: false
  });

  try {
    console.log('=== Menyesuaikan tabel inventory_requests ===\n');

    // 1. Tambah kolom title jika belum ada
    if (!(await columnExists(conn, 'inventory_requests', 'title'))) {
      console.log('[1] Menambah kolom title...');
      await conn.query(
        "ALTER TABLE inventory_requests ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT '' AFTER request_number"
      );
      console.log('    ✓ Kolom title ditambahkan');
    } else {
      console.log('[1] Kolom title sudah ada ✓');
    }

    // 2. Tambah kolom created_by jika belum ada
    if (!(await columnExists(conn, 'inventory_requests', 'created_by'))) {
      console.log('[2] Menambah kolom created_by...');
      await conn.query(
        'ALTER TABLE inventory_requests ADD COLUMN created_by BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER title'
      );
      console.log('    ✓ Kolom created_by ditambahkan');
    } else {
      console.log('[2] Kolom created_by sudah ada ✓');
    }

    // 3. Ubah ENUM status agar mencakup 'submitted' dan 'pending'
    console.log('[3] Update ENUM status (tambah submitted jika belum ada)...');
    await conn.query(
      "ALTER TABLE inventory_requests MODIFY COLUMN status ENUM('pending','submitted','approved','rejected','fulfilled') NOT NULL DEFAULT 'pending'"
    );
    console.log('    ✓ ENUM status updated');

    // 4. Pastikan request_date bisa NULL (kita isi NOW())
    console.log('[4] Buat request_date nullable...');
    await conn.query(
      'ALTER TABLE inventory_requests MODIFY COLUMN request_date DATE NULL'
    );
    console.log('    ✓ request_date bisa NULL');

    // 5. Cek hasil akhir
    const [cols] = await conn.query('DESCRIBE inventory_requests');
    console.log('\n=== Struktur inventory_requests sekarang ===');
    cols.forEach(c => console.log(`  ${c.Field} | ${c.Type} | Default: ${c.Default}`));

    console.log('\n=== Selesai! Aplikasi siap dijalankan ===');
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
