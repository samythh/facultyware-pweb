// Seed TAMBAHAN PO dummy berstatus 'draft' untuk menguji alur
// verifikasi -> konfirmasi modul Penerimaan Barang.
// Oleh: Mikail (2411523016) - Kelompok B09
//
// Aman dijalankan berulang (idempotent): upsert by purchase_number,
// item PO diisi ulang, dan transaksi/verifikasi PO ini direset ke draft.
//
// Jalankan: node scripts/seed_receiving_more.js

const pool = require("../lib/db");

// Item baru (kalau belum ada) agar variasi data lebih kaya.
const ITEMS = [
  { code: "ATK-004", name: "Spidol Whiteboard", unit: "Buah" },
  { code: "ELK-002", name: "Mouse Wireless Logitech", unit: "Unit" },
  { code: "ELK-003", name: "Kabel HDMI 2m", unit: "Buah" },
  { code: "MBL-002", name: "Meja Rapat Lipat", unit: "Unit" },
];

// Semua draft supaya tombol Verifikasi & Konfirmasi Final aktif.
const PURCHASES = [
  {
    purchase_number: "PB-2025-004",
    purchase_date: "2025-06-01",
    supplier: "CV Sumber Rezeki",
    status: "draft",
    items: [
      { code: "ATK-001", quantity: 30, price: 55000 },
      { code: "ATK-004", quantity: 24, price: 8500 },
      { code: "ELK-003", quantity: 15, price: 45000 },
    ],
  },
  {
    purchase_number: "PB-2025-005",
    purchase_date: "2025-06-03",
    supplier: "PT Andalas Office Supply",
    status: "draft",
    items: [
      { code: "ELK-002", quantity: 20, price: 185000 },
      { code: "ELK-001", quantity: 6, price: 1250000 },
    ],
  },
  {
    purchase_number: "PB-2025-006",
    purchase_date: "2025-06-05",
    supplier: "Toko Maju Bersama",
    status: "draft",
    items: [
      { code: "MBL-002", quantity: 4, price: 2300000 },
      { code: "MBL-001", quantity: 6, price: 1750000 },
    ],
  },
  {
    purchase_number: "PB-2025-007",
    purchase_date: "2025-06-08",
    supplier: "UD Berkah Jaya",
    status: "draft",
    items: [
      { code: "ATK-002", quantity: 150, price: 3500 },
      { code: "ATK-003", quantity: 100, price: 2500 },
      { code: "ATK-004", quantity: 40, price: 8500 },
    ],
  },
];

async function main() {
  const itemId = {}; // code -> id

  // 1) Pastikan item ada (item lama dari seed utama + item baru di sini).
  for (const it of ITEMS) {
    await pool.query(
      `INSERT INTO items (name, code, unit, minimal_quantity, created_at, updated_at)
       VALUES (?, ?, ?, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit), updated_at = NOW()`,
      [it.name, it.code, it.unit]
    );
  }
  const [allItems] = await pool.query("SELECT id, code FROM items");
  allItems.forEach((r) => (itemId[r.code] = r.id));
  // Tabel inventories (stok) milik modul Stok Opname (B11) — tidak disentuh seed Penerimaan.

  // 2) Upsert PO + isi ulang item, reset transaksi & hasil verifikasi.
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
    const [[row]] = await pool.query(
      "SELECT id FROM inventory_purchases WHERE purchase_number = ?",
      [po.purchase_number]
    );
    const poId = row.id;

    await pool.query(
      "DELETE FROM inventory_purchase_items WHERE inventory_purchase_id = ?",
      [poId]
    );
    for (const line of po.items) {
      await pool.query(
        `INSERT INTO inventory_purchase_items
           (inventory_purchase_id, item_id, quantity, price, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [poId, itemId[line.code], line.quantity, line.price]
      );
    }

    // Bersihkan jejak uji sebelumnya untuk PO ini.
    await pool.query(
      "DELETE FROM inventory_transactions WHERE reference = ?",
      [po.purchase_number]
    );
    await pool.query(
      "DELETE FROM inventory_receiving_attachments WHERE inventory_purchase_id = ?",
      [poId]
    );
  }

  console.log("Seed tambahan PO draft selesai:");
  console.log(`  item baru   : ${ITEMS.length}`);
  console.log(`  PO draft    : ${PURCHASES.length} (PB-2025-004 s/d 007)`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seed gagal:", err.message);
  process.exit(1);
});
