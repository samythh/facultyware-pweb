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

  // 4) Arahkan ulang FK inventory_purchases.inventory_procurement_id
  //    dari tabel lama inventory_procurements -> inventory_requests.
  //    Modul procurement kini memakai inventory_requests sebagai sumber
  //    permintaan, jadi kolom ini menyimpan inventory_requests.id.
  const reqFkName = "fk_ip_request";
  if (await foreignKeyExists("inventory_purchases", reqFkName)) {
    console.log(`- foreign key ${reqFkName} sudah ada (lewati)`);
  } else {
    // Hapus FK lama yang masih menunjuk ke inventory_procurements (apa pun namanya)
    const [oldFks] = await pool.query(
      `SELECT constraint_name AS cn
         FROM information_schema.referential_constraints
        WHERE constraint_schema = DATABASE()
          AND table_name = 'inventory_purchases'
          AND referenced_table_name = 'inventory_procurements'`
    );
    for (const row of oldFks) {
      await pool.query(
        `ALTER TABLE inventory_purchases DROP FOREIGN KEY \`${row.cn}\``
      );
      console.log(`+ FK lama ${row.cn} (-> inventory_procurements) dihapus`);
    }

    // Putuskan tautan PO yang menggantung: id yang tidak ada di inventory_requests
    const [upd] = await pool.query(
      `UPDATE inventory_purchases ip
          LEFT JOIN inventory_requests r ON r.id = ip.inventory_procurement_id
          SET ip.inventory_procurement_id = NULL
        WHERE ip.inventory_procurement_id IS NOT NULL AND r.id IS NULL`
    );
    if (upd.affectedRows > 0) {
      console.log(`+ ${upd.affectedRows} PO dengan tautan menggantung di-NULL-kan`);
    }

    // Pasang FK baru ke inventory_requests
    await pool.query(
      `ALTER TABLE inventory_purchases
       ADD CONSTRAINT ${reqFkName}
       FOREIGN KEY (inventory_procurement_id)
       REFERENCES inventory_requests (id)
       ON DELETE SET NULL`
    );
    console.log(`+ foreign key ${reqFkName} (-> inventory_requests) ditambahkan`);
  }

  console.log("=== Migrasi Supplier Selesai ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration gagal:", err.message);
  process.exit(1);
});
