// Seed data dummy untuk Modul Penerimaan Barang (preview tampilan).
// Oleh: Mikail (2411523016) - Kelompok B09
//
// Aman dijalankan berulang (idempotent): upsert by unique key, dan
// purchase_items / transaksi dummy dihapus dulu sebelum diisi ulang.
//
// Jalankan: node scripts/seed_receiving_dummy.js

const pool = require("../lib/db");

const ITEMS = [
  { code: "ATK-001", name: "Kertas HVS A4 80gr", unit: "Rim" },
  { code: "ATK-002", name: "Pulpen Standar AE7", unit: "Buah" },
  { code: "ATK-003", name: "Map Snelhecter", unit: "Buah" },
  { code: "ELK-001", name: "Toner Printer HP 85A", unit: "Buah" },
  { code: "MBL-001", name: "Kursi Kerja Ergonomis", unit: "Unit" },
];

const PURCHASES = [
  {
    purchase_number: "PB-2025-001",
    purchase_date: "2025-03-10",
    supplier: "CV Sumber Rezeki",
    status: "completed",
    items: [
      { code: "ATK-001", quantity: 50, price: 55000 },
      { code: "ATK-002", quantity: 100, price: 3500 },
    ],
  },
  {
    purchase_number: "PB-2025-002",
    purchase_date: "2025-04-02",
    supplier: "PT Andalas Office Supply",
    status: "draft",
    items: [
      { code: "ELK-001", quantity: 10, price: 1250000 },
      { code: "ATK-003", quantity: 200, price: 2500 },
    ],
  },
  {
    purchase_number: "PB-2025-003",
    purchase_date: "2025-05-15",
    supplier: "Toko Maju Bersama",
    status: "draft",
    items: [{ code: "MBL-001", quantity: 8, price: 1750000 }],
  },
];

async function main() {
  const itemId = {}; // code -> id

  // 1) Upsert items, ambil id-nya.
  for (const it of ITEMS) {
    await pool.query(
      `INSERT INTO items (name, code, unit, minimal_quantity, created_at, updated_at)
       VALUES (?, ?, ?, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit), updated_at = NOW()`,
      [it.name, it.code, it.unit]
    );
    const [[row]] = await pool.query("SELECT id FROM items WHERE code = ?", [it.code]);
    itemId[it.code] = row.id;

    // Pastikan ada baris stok awal untuk tiap item.
    const [inv] = await pool.query("SELECT id FROM inventories WHERE item_id = ?", [row.id]);
    if (inv.length === 0) {
      await pool.query(
        "INSERT INTO inventories (item_id, quantity, created_at, updated_at) VALUES (?, 0, NOW(), NOW())",
        [row.id]
      );
    }
  }

  // 2) Upsert purchases + isi ulang purchase_items & transaksi dummy.
  for (const po of PURCHASES) {
    await pool.query(
      `INSERT INTO inventory_purchases (purchase_number, purchase_date, supplier, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE purchase_date = VALUES(purchase_date),
                               supplier = VALUES(supplier),
                               status = VALUES(status),
                               updated_at = NOW()`,
      [po.purchase_number, po.purchase_date, po.supplier, po.status]
    );
    const [[purchase]] = await pool.query(
      "SELECT id FROM inventory_purchases WHERE purchase_number = ?",
      [po.purchase_number]
    );
    const poId = purchase.id;

    // Reset item PO ini, lalu isi ulang.
    await pool.query("DELETE FROM inventory_purchase_items WHERE inventory_purchase_id = ?", [poId]);
    for (const line of po.items) {
      await pool.query(
        `INSERT INTO inventory_purchase_items
           (inventory_purchase_id, item_id, quantity, price, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [poId, itemId[line.code], line.quantity, line.price]
      );
    }

    // Reset transaksi dummy untuk PO ini.
    await pool.query("DELETE FROM inventory_transactions WHERE reference = ?", [po.purchase_number]);

    // PO 'completed' dianggap sudah diterima -> catat transaksi masuk (stok bertambah).
    if (po.status === "completed") {
      for (const line of po.items) {
        await pool.query(
          `INSERT INTO inventory_transactions
             (item_id, type, quantity, transaction_date, reference, notes, created_at, updated_at)
           VALUES (?, 'in', ?, ?, ?, 'Penerimaan barang (seed dummy)', NOW(), NOW())`,
          [itemId[line.code], line.quantity, po.purchase_date, po.purchase_number]
        );
        await pool.query(
          "UPDATE inventories SET quantity = quantity + ?, updated_at = NOW() WHERE item_id = ?",
          [line.quantity, itemId[line.code]]
        );
      }
    }
  }

  console.log("Seed dummy penerimaan barang selesai:");
  console.log(`  items      : ${ITEMS.length}`);
  console.log(`  purchases  : ${PURCHASES.length} (1 completed, 2 draft)`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seed gagal:", err.message);
  process.exit(1);
});
