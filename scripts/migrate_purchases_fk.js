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
      await pool.query(
        `ALTER TABLE inventory_purchases 
         ADD CONSTRAINT inventory_purchases_inventory_procurement_id_foreign 
         FOREIGN KEY (inventory_procurement_id) 
         REFERENCES inventory_procurements(id) 
         ON DELETE SET NULL`
      );
      console.log("+ FK baru berhasil ditambahkan.");
    }
  } else {
    console.log("- Tidak ada constraint FK pada inventory_procurement_id. Menambahkan baru...");
    await pool.query(
      `ALTER TABLE inventory_purchases 
       ADD CONSTRAINT inventory_purchases_inventory_procurement_id_foreign 
       FOREIGN KEY (inventory_procurement_id) 
       REFERENCES inventory_procurements(id) 
       ON DELETE SET NULL`
    );
    console.log("+ FK baru berhasil ditambahkan.");
  }

  console.log("=== Migrasi FK Selesai ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration gagal:", err.message);
  process.exit(1);
});
