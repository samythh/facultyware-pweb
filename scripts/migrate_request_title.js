// Migrasi (modul Permintaan): tambah kolom judul opsional.
// inventory_requests.title -> pemohon bisa memberi judul permintaan.
// Bila kosong, tampilan memakai ringkasan otomatis dari daftar barang.
// Disetujui dosen. Idempotent.
//
// Jalankan: node scripts/migrate_request_title.js

const pool = require("../lib/db");

async function columnExists(table, column) {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
    [table, column]
  );
  return r[0].n > 0;
}

async function main() {
  console.log("=== Migrasi kolom judul permintaan ===");
  if (await columnExists("inventory_requests", "title")) {
    console.log("- inventory_requests.title sudah ada (lewati)");
  } else {
    await pool.query(
      `ALTER TABLE inventory_requests
       ADD COLUMN title varchar(255) DEFAULT NULL AFTER request_number`
    );
    console.log("+ kolom inventory_requests.title ditambahkan");
  }
  console.log("=== Selesai ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Migrasi gagal:", err.message);
  process.exit(1);
});
