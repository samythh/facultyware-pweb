// Migrasi (modul PO): dukungan PERSETUJUAN PO oleh Wakil Dekan.
// Perluas enum inventory_purchases.status (pending/approved/rejected) + kolom
// approved_by / approved_at / approval_notes. Disetujui dosen. Idempotent.
//
// Jalankan: node scripts/migrate_po_approval.js

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
  console.log("=== Migrasi persetujuan PO ===");

  await pool.query(
    `ALTER TABLE inventory_purchases
     MODIFY COLUMN status ENUM('draft','pending','approved','rejected','completed') NOT NULL DEFAULT 'pending'`
  );
  console.log("+ enum inventory_purchases.status diperluas (pending/approved/rejected)");

  if (await columnExists("inventory_purchases", "approved_by")) {
    console.log("- kolom approval PO sudah ada (lewati)");
  } else {
    await pool.query(
      `ALTER TABLE inventory_purchases
       ADD COLUMN approved_by bigint(20) unsigned DEFAULT NULL AFTER status,
       ADD COLUMN approved_at timestamp NULL DEFAULT NULL AFTER approved_by,
       ADD COLUMN approval_notes text DEFAULT NULL AFTER approved_at`
    );
    console.log("+ kolom approved_by / approved_at / approval_notes ditambahkan");
  }
  if (await fkExists("inventory_purchases", "fk_po_approver")) {
    console.log("- FK fk_po_approver sudah ada (lewati)");
  } else {
    await pool.query(
      `ALTER TABLE inventory_purchases ADD CONSTRAINT fk_po_approver
       FOREIGN KEY (approved_by) REFERENCES employees (id) ON DELETE SET NULL`
    );
    console.log("+ FK fk_po_approver ditambahkan");
  }

  console.log("=== Selesai ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Migrasi gagal:", err.message);
  process.exit(1);
});
