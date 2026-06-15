// Migration skema Modul Supplier & PO (B09).
//
// Idempotent: cek dulu keberadaan tabel/kolom/constraint sebelum membuat/mengubah.
// Jalankan: node scripts/migrate_suppliers_schema.js

const pool = require("../lib/db");

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?`,
    [table, column]
  );
  return rows[0].n > 0;
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?`,
    [table]
  );
  return rows[0].n > 0;
}

async function foreignKeyExists(table, constraintName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE()
        AND table_name = ?
        AND constraint_name = ?
        AND constraint_type = 'FOREIGN KEY'`,
    [table, constraintName]
  );
  return rows[0].n > 0;
}

async function main() {
  console.log("=== Memulai Migrasi Supplier ===");

  // 1) Buat tabel suppliers jika belum ada
  if (await tableExists("suppliers")) {
    console.log("- tabel suppliers sudah ada (lewati)");
  } else {
    await pool.query(
      `CREATE TABLE suppliers (
         id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
         name varchar(255) NOT NULL,
         code varchar(100) NOT NULL UNIQUE,
         email varchar(255) DEFAULT NULL,
         phone varchar(100) DEFAULT NULL,
         address text DEFAULT NULL,
         created_at timestamp NULL DEFAULT NULL,
         updated_at timestamp NULL DEFAULT NULL,
         PRIMARY KEY (id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    console.log("+ tabel suppliers berhasil dibuat");
  }

  // 2) Tambahkan kolom supplier_id ke inventory_purchases jika belum ada
  if (await columnExists("inventory_purchases", "supplier_id")) {
    console.log("- kolom inventory_purchases.supplier_id sudah ada (lewati)");
  } else {
    await pool.query(
      `ALTER TABLE inventory_purchases 
       ADD COLUMN supplier_id bigint(20) unsigned DEFAULT NULL AFTER inventory_procurement_id`
    );
    console.log("+ kolom inventory_purchases.supplier_id ditambahkan");
  }

  // 3) Hubungkan foreign key ke suppliers(id) jika belum ada
  const fkName = "fk_ip_supplier";
  if (await foreignKeyExists("inventory_purchases", fkName)) {
    console.log(`- foreign key ${fkName} sudah ada (lewati)`);
  } else {
    await pool.query(
      `ALTER TABLE inventory_purchases
       ADD CONSTRAINT ${fkName}
       FOREIGN KEY (supplier_id)
       REFERENCES suppliers (id)
       ON DELETE SET NULL`
    );
    console.log(`+ foreign key ${fkName} berhasil ditambahkan`);
  }

  console.log("=== Migrasi Supplier Selesai ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration gagal:", err.message);
  process.exit(1);
});
