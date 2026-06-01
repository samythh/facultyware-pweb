// Migration skema Modul Penerimaan Barang (Mikail - B09).
//
// Diizinkan dosen (2026-06-01) untuk menambah tabel/kolom penyimpanan
// bukti penerimaan (multi-file) dan hasil verifikasi per item.
//
// Idempotent: cek dulu keberadaan tabel/kolom sebelum membuat.
// Jalankan: node scripts/migrate_receiving_schema.js

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

async function main() {
  // 1) Tabel bukti penerimaan (satu PO bisa banyak berkas).
  if (await tableExists("inventory_receiving_attachments")) {
    console.log("- tabel inventory_receiving_attachments sudah ada (lewati)");
  } else {
    await pool.query(
      `CREATE TABLE inventory_receiving_attachments (
         id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
         inventory_purchase_id bigint(20) unsigned NOT NULL,
         file_path varchar(255) NOT NULL,
         original_name varchar(255) DEFAULT NULL,
         mime_type varchar(100) DEFAULT NULL,
         size int(11) DEFAULT NULL,
         created_at timestamp NULL DEFAULT NULL,
         PRIMARY KEY (id),
         KEY idx_ira_purchase (inventory_purchase_id),
         CONSTRAINT fk_ira_purchase
           FOREIGN KEY (inventory_purchase_id)
           REFERENCES inventory_purchases (id)
           ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
    console.log("+ tabel inventory_receiving_attachments dibuat");
  }

  // 2) Kolom hasil verifikasi per item (semua nullable -> aman bagi modul lain).
  // received_quantity = jumlah DITERIMA BAIK.
  // received_defective = jumlah CACAT (bisa diretur).
  // received_note = catatan per item.
  const cols = [
    ["received_quantity", "int(11) DEFAULT NULL"],
    ["received_defective", "int(11) DEFAULT NULL"],
    ["received_note", "varchar(255) DEFAULT NULL"],
  ];
  for (const [name, def] of cols) {
    if (await columnExists("inventory_purchase_items", name)) {
      console.log(`- kolom inventory_purchase_items.${name} sudah ada (lewati)`);
    } else {
      await pool.query(
        `ALTER TABLE inventory_purchase_items ADD COLUMN ${name} ${def}`
      );
      console.log(`+ kolom inventory_purchase_items.${name} ditambahkan`);
    }
  }

  // 3) Bersihkan kolom usang: received_condition (enum kondisi) digantikan
  //    pemisahan jumlah baik/cacat, jadi tidak dipakai lagi.
  if (await columnExists("inventory_purchase_items", "received_condition")) {
    await pool.query(
      "ALTER TABLE inventory_purchase_items DROP COLUMN received_condition"
    );
    console.log("- kolom usang inventory_purchase_items.received_condition di-DROP");
  }

  console.log("Migration skema penerimaan selesai.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration gagal:", err.message);
  process.exit(1);
});
