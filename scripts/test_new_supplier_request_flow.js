const db = require('../lib/db');

async function runTest() {
  console.log('=== MEMULAI INTEGRATION TEST ALUR BARU ===');
  let supplierId = null;
  let requestId = null;
  let purchaseId = null;

  try {
    // 1. Bersihkan data sisa test sebelumnya (jika ada)
    console.log('1. Membersihkan data test lama...');
    await db.query('DELETE FROM inventory_purchase_items WHERE inventory_purchase_id IN (SELECT id FROM inventory_purchases WHERE purchase_number LIKE "PO-TEST-%")');
    await db.query('DELETE FROM inventory_purchases WHERE purchase_number LIKE "PO-TEST-%"');
    await db.query('DELETE FROM inventory_request_details WHERE inventory_request_id IN (SELECT id FROM inventory_requests WHERE request_number LIKE "PRQ-TEST-%")');
    await db.query('DELETE FROM inventory_requests WHERE request_number LIKE "PRQ-TEST-%"');
    await db.query('DELETE FROM suppliers WHERE code = "SPL-TEST-999"');

    // 2. Buat Supplier Baru
    console.log('2. Membuat supplier baru...');
    const [supplierResult] = await db.query(
      `INSERT INTO suppliers (name, code, email, phone, address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      ['PT. Test Komputer', 'SPL-TEST-999', 'test@komputer.com', '08123456', 'Jl. Kampus Unand']
    );
    supplierId = supplierResult.insertId;
    console.log(`✓ Supplier dibuat dengan ID: ${supplierId}`);

    // 3. Buat Request Baru (status harus 'pending')
    console.log('3. Membuat permohonan baru (inventory_requests)...');
    const [requestResult] = await db.query(
      `INSERT INTO inventory_requests (request_number, employee_id, request_date, status, approved_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      ['PRQ-TEST-999', 1, '2026-06-15', 'pending', 0]
    );
    requestId = requestResult.insertId;
    console.log(`✓ Permintaan dibuat dengan ID: ${requestId}`);

    // Tambah item detail
    await db.query(
      `INSERT INTO inventory_request_details (inventory_request_id, item_id, item_name, specification, quantity, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, NOW(), NOW())`,
      [requestId, 'Monitor LCD Test', 'Spec 4K HDR', 5]
    );
    console.log('✓ Detail barang berhasil dimasukkan ke inventory_request_details');

    // Verifikasi permohonan awal
    const [reqRows] = await db.query('SELECT * FROM inventory_requests WHERE id = ?', [requestId]);
    if (reqRows.length === 0 || reqRows[0].status !== 'pending') {
      throw new Error('Gagal memverifikasi permohonan berstatus pending');
    }
    console.log('✓ Status permohonan terverifikasi: pending');

    // 4. Simulasikan Wadir menyetujui permohonan
    console.log('4. Mensimulasikan persetujuan Wadir...');
    await db.query(
      "UPDATE inventory_requests SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?",
      [1, requestId]
    );
    console.log('✓ Permintaan disetujui');

    // 5. Buat Purchase Order (PO) yang menautkan supplier_id dan request_id
    console.log('5. Membuat Purchase Order...');
    const [purchaseResult] = await db.query(
      `INSERT INTO inventory_purchases (purchase_number, inventory_procurement_id, purchase_date, supplier, supplier_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      ['PO-TEST-999', requestId, '2026-06-15', 'PT. Test Komputer', supplierId, 'draft']
    );
    purchaseId = purchaseResult.insertId;
    console.log(`✓ Purchase Order dibuat dengan ID: ${purchaseId}`);

    // Masukkan item ke PO
    await db.query(
      `INSERT INTO inventory_purchase_items (inventory_purchase_id, item_id, quantity, price, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [purchaseId, 1, 5, 2500000]
    );
    console.log('✓ Item Purchase Order berhasil dimasukkan');

    // 6. Verifikasi Relasi Akhir
    console.log('6. Memverifikasi relasi data...');
    const [poRows] = await db.query(
      `SELECT p.*, s.name as supplier_name, r.request_number 
       FROM inventory_purchases p
       JOIN suppliers s ON p.supplier_id = s.id
       JOIN inventory_requests r ON p.inventory_procurement_id = r.id
       WHERE p.id = ?`,
      [purchaseId]
    );

    if (poRows.length === 0) {
      throw new Error('Verifikasi akhir gagal: data PO tidak ditemukan');
    }

    const po = poRows[0];
    console.log(`✓ Nomor PO: ${po.purchase_number}`);
    console.log(`✓ Terhubung ke Supplier: ${po.supplier_name}`);
    console.log(`✓ Terhubung ke Request: ${po.request_number}`);
    
    // 7. Bersihkan data test kembali
    console.log('7. Membersihkan data hasil pengujian...');
    await db.query('DELETE FROM inventory_purchase_items WHERE inventory_purchase_id = ?', [purchaseId]);
    await db.query('DELETE FROM inventory_purchases WHERE id = ?', [purchaseId]);
    await db.query('DELETE FROM inventory_request_details WHERE inventory_request_id = ?', [requestId]);
    await db.query('DELETE FROM inventory_requests WHERE id = ?', [requestId]);
    await db.query('DELETE FROM suppliers WHERE id = ?', [supplierId]);
    console.log('✓ Data pengujian berhasil dibersihkan.');

    console.log('=== PENGUJIAN INTEGRASI SELESAI DENGAN SUKSES! ===');
  } catch (error) {
    console.error('✗ PENGUJIAN GAGAL:', error.message);
    // Bersihkan sisa jika ada error
    try {
      if (purchaseId) {
        await db.query('DELETE FROM inventory_purchase_items WHERE inventory_purchase_id = ?', [purchaseId]);
        await db.query('DELETE FROM inventory_purchases WHERE id = ?', [purchaseId]);
      }
      if (requestId) {
        await db.query('DELETE FROM inventory_request_details WHERE inventory_request_id = ?', [requestId]);
        await db.query('DELETE FROM inventory_requests WHERE id = ?', [requestId]);
      }
      if (supplierId) {
        await db.query('DELETE FROM suppliers WHERE id = ?', [supplierId]);
      }
    } catch (cleanErr) {
      console.error('Gagal membersihkan data sisa:', cleanErr.message);
    }
  } finally {
    await db.end();
  }
}

runTest();
