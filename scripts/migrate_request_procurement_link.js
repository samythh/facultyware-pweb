// Migrasi (modul Pengadaan): kolom penghubung KONSOLIDASI.
// inventory_requests.inventory_procurement_id (FK) -> banyak permintaan bisa
// dirujuk ke satu pengadaan. Disetujui dosen. Idempotent.
//
// Jalankan: node scripts/migrate_request_procurement_link.js

const pool = require("../lib/db");

async function columnExists(table, column) {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
    [table, column]
  );
  return r[0].n > 0;
}
async function fkExists(table, name) {
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM information_schema.table_constraints
      WHERE constraint_schema=DATABASE() AND table_name=? AND constraint_name=? AND constraint_type='FOREIGN KEY'`,
    [table, name]
  );
  return r[0].n > 0;
}

async function main() {
  console.log("=== Migrasi kolom konsolidasi permintaan->pengadaan ===");
  if (await columnExists("inventory_requests", "inventory_procurement_id")) {
    console.log("- inventory_requests.inventory_procurement_id sudah ada (lewati)");
  } else {
    await pool.query(
      `ALTER TABLE inventory_requests
       ADD COLUMN inventory_procurement_id bigint(20) unsigned DEFAULT NULL AFTER status`
    );
    console.log("+ kolom inventory_requests.inventory_procurement_id ditambahkan");
  }
  if (await fkExists("inventory_requests", "fk_req_procurement")) {
    console.log("- FK fk_req_procurement sudah ada (lewati)");
  } else {
    await pool.query(
      `ALTER TABLE inventory_requests ADD CONSTRAINT fk_req_procurement
       FOREIGN KEY (inventory_procurement_id) REFERENCES inventory_procurements (id) ON DELETE SET NULL`
    );
    console.log("+ FK fk_req_procurement ditambahkan");
  }
  console.log("=== Selesai ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Migrasi gagal:", err.message);
  process.exit(1);
});
