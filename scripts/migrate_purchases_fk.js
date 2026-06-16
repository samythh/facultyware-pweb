// Skrip Migrasi FK inventory_purchases.inventory_procurement_id (Tugas Mutiara).
//
// Idempotent: memeriksa kemana foreign key merujuk saat ini. Jika tidak merujuk
// ke inventory_procurements, skrip akan menghapus FK lama dan membuat FK baru yang benar.
//
// Jalankan: node scripts/migrate_purchases_fk.js

const pool = require("../lib/db");

async function getForeignKeyReferencedTable(table, columnName) {
  const [rows] = await pool.query(
    `SELECT REFERENCED_TABLE_NAME, CONSTRAINT_NAME
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, columnName]
  );
  return rows.length > 0 ? rows[0] : null;
}

// NULL-kan nilai inventory_procurement_id yang tidak ada di inventory_procurements.
// Wajib dijalankan sebelum ADD CONSTRAINT agar FK tidak gagal (errno 1452) pada DB
// yang sempat punya PO dari era lama (mis. id merujuk ke inventory_requests).
async function nullOutDanglingRefs() {
  const [res] = await pool.query(
    `UPDATE inventory_purchases ip
        LEFT JOIN inventory_procurements pr ON pr.id = ip.inventory_procurement_id
        SET ip.inventory_procurement_id = NULL
      WHERE ip.inventory_procurement_id IS NOT NULL AND pr.id IS NULL`
  );
  if (res.affectedRows > 0) {
    console.log(`+ ${res.affectedRows} baris PO dengan referensi menggantung di-NULL-kan (agar FK valid)`);
  }
}

async function addProcurementFk() {
  await nullOutDanglingRefs();
  await pool.query(
    `ALTER TABLE inventory_purchases
     ADD CONSTRAINT inventory_purchases_inventory_procurement_id_foreign
     FOREIGN KEY (inventory_procurement_id)
     REFERENCES inventory_procurements(id)
     ON DELETE SET NULL`
  );
  console.log("+ FK baru berhasil ditambahkan.");
}

async function main() {
  console.log("=== Memulai Migrasi FK PO ke inventory_procurements ===");

  const fkInfo = await getForeignKeyReferencedTable("inventory_purchases", "inventory_procurement_id");

  if (fkInfo) {
    const { REFERENCED_TABLE_NAME, CONSTRAINT_NAME } = fkInfo;
    console.log(`- Constraint FK saat ini: ${CONSTRAINT_NAME} -> merujuk ke tabel: ${REFERENCED_TABLE_NAME}`);
    
    if (REFERENCED_TABLE_NAME === "inventory_procurements") {
      console.log("- FK sudah menunjuk ke inventory_procurements (lewati)");
    } else {
      console.log(`- Menghapus FK ${CONSTRAINT_NAME} yang merujuk ke tabel salah (${REFERENCED_TABLE_NAME})...`);
      await pool.query(`ALTER TABLE inventory_purchases DROP FOREIGN KEY ${CONSTRAINT_NAME}`);
      console.log("+ FK lama berhasil dihapus.");
      
      console.log("- Menambahkan FK baru ke inventory_procurements(id)...");
      await addProcurementFk();
    }
  } else {
    console.log("- Tidak ada constraint FK pada inventory_procurement_id. Menambahkan baru...");
    await addProcurementFk();
  }

  console.log("=== Migrasi FK Selesai ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration gagal:", err.message);
  process.exit(1);
});
