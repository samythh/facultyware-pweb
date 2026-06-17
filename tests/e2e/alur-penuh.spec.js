// Alur penuh lintas-role: permintaan -> disetujui Wadir -> dikonsolidasi jadi
// pengadaan -> PO -> disetujui Wadir -> verifikasi penerimaan (ada cacat) ->
// barang ganti -> cacat tertutup (verifikasi fix D nomor 1).
//
// Test ini MENULIS data lalu MEMBERSIHKANNYA sendiri lewat DB (afterAll),
// memakai koneksi lib/db (yang sudah memuat .env).
const { test, expect } = require('@playwright/test');
const { USERS } = require('./helpers');
const db = require('../../lib/db');

test.describe('Alur penuh pengadaan', () => {
  const ctx = {};
  const stamp = Date.now();
  const judulPermintaan = `E2E Permintaan ${stamp}`;
  const judulPengadaan = `E2E Pengadaan ${stamp}`;
  const namaBarang = `Barang E2E ${stamp}`;

  async function loginReq(page, role) {
    const u = USERS[role];
    const r = await page.request.post('/login', { form: { email: u.email, password: u.password } });
    expect(r.ok(), `login ${role}`).toBeTruthy();
  }

  test('permintaan disetujui, dikonsolidasi jadi PO, lalu barang ganti menutup cacat', async ({ page }) => {
    // 1. Admin membuat permintaan (1 barang, jumlah 5).
    await loginReq(page, 'admin');
    let r = await page.request.post('/procurement/create', {
      form: { title: judulPermintaan, item_name: namaBarang, quantity: '5' },
    });
    expect(r.ok()).toBeTruthy();
    let [rows] = await db.query(
      'SELECT id, request_number FROM inventory_requests WHERE title = ? ORDER BY id DESC LIMIT 1',
      [judulPermintaan]
    );
    expect(rows.length, 'permintaan tersimpan').toBe(1);
    ctx.reqId = rows[0].id;
    ctx.reqNumber = rows[0].request_number;

    // 2. Wakil dekan menyetujui permintaan.
    await loginReq(page, 'wadir');
    r = await page.request.post(`/approval/${ctx.reqId}/approve`);
    expect(r.ok()).toBeTruthy();
    [rows] = await db.query('SELECT status FROM inventory_requests WHERE id = ?', [ctx.reqId]);
    expect(rows[0].status).toBe('approved');

    // 3. Admin mengonsolidasi permintaan menjadi satu pengadaan.
    await loginReq(page, 'admin');
    r = await page.request.post('/pengadaan/create', {
      form: { title: judulPengadaan, request_number: ctx.reqNumber },
    });
    expect(r.ok()).toBeTruthy();
    [rows] = await db.query(
      'SELECT id FROM inventory_procurements WHERE title = ? ORDER BY id DESC LIMIT 1',
      [judulPengadaan]
    );
    expect(rows.length, 'pengadaan tersimpan').toBe(1);
    ctx.procId = rows[0].id;

    // 4. Admin membuat PO dari pengadaan tersebut.
    const [sup] = await db.query('SELECT id FROM suppliers ORDER BY id LIMIT 1');
    expect(sup.length, 'butuh minimal 1 supplier').toBeGreaterThan(0);
    const today = new Date().toISOString().slice(0, 10);
    r = await page.request.post('/purchase/create', {
      form: {
        inventory_procurement_id: String(ctx.procId),
        supplier_id: String(sup[0].id),
        purchase_date: today,
        prices: '15000',
      },
    });
    expect(r.ok()).toBeTruthy();
    [rows] = await db.query(
      'SELECT id, purchase_number FROM inventory_purchases WHERE inventory_procurement_id = ? ORDER BY id DESC LIMIT 1',
      [ctx.procId]
    );
    expect(rows.length, 'PO tersimpan').toBe(1);
    ctx.poId = rows[0].id;
    ctx.poNumber = rows[0].purchase_number;

    // 5. Wakil dekan menyetujui PO (gerbang kedua, sadar-harga).
    await loginReq(page, 'wadir');
    r = await page.request.post(`/purchase/${ctx.poId}/approve`);
    expect(r.ok()).toBeTruthy();
    [rows] = await db.query('SELECT status FROM inventory_purchases WHERE id = ?', [ctx.poId]);
    expect(rows[0].status).toBe('approved');

    // 6. Admin memverifikasi penerimaan: 3 baik, 2 cacat (dari 5 dipesan).
    await loginReq(page, 'admin');
    const [pis] = await db.query(
      'SELECT id, item_id FROM inventory_purchase_items WHERE inventory_purchase_id = ?',
      [ctx.poId]
    );
    expect(pis.length).toBe(1);
    ctx.piId = pis[0].id;
    ctx.itemId = pis[0].item_id;
    r = await page.request.post(`/receiving/${ctx.poId}/verify`, {
      form: { [`good_qty[${ctx.piId}]`]: '3', [`defective_qty[${ctx.piId}]`]: '2' },
    });
    expect(r.ok()).toBeTruthy();
    [rows] = await db.query(
      'SELECT received_quantity, received_defective FROM inventory_purchase_items WHERE id = ?',
      [ctx.piId]
    );
    expect(Number(rows[0].received_quantity)).toBe(3);
    expect(Number(rows[0].received_defective)).toBe(2);

    // 7. Admin mencatat barang ganti sebanyak 2 (menutup yang cacat).
    r = await page.request.post('/receiving/replacement', {
      form: { po_id: String(ctx.poId), item_id: String(ctx.itemId), quantity: '2' },
    });
    expect(r.ok()).toBeTruthy();

    // 8. Pada detail penerimaan: cacat menjadi 0 (fix D) & barang ganti tercatat.
    await page.goto(`/receiving/${ctx.poId}/detail`);
    await expect(page.getByRole('heading', { name: 'Detail Penerimaan' })).toBeVisible();
    await expect(page.locator('.cond-cacat')).toHaveCount(0);
    await expect(page.getByText('Riwayat Barang Ganti')).toBeVisible();
    // Total "Diterima Baik" menjadi penuh (5).
    await expect(page.locator('tfoot')).toContainText('5');
  });

  test.afterAll(async () => {
    const q = async (sql, p) => { try { await db.query(sql, p); } catch (e) { /* abaikan saat bersih-bersih */ } };
    if (ctx.poNumber) await q('DELETE FROM inventory_transactions WHERE reference = ?', [ctx.poNumber]);
    if (ctx.poId) {
      await q('DELETE FROM inventory_receiving_attachments WHERE inventory_purchase_id = ?', [ctx.poId]);
      await q('DELETE FROM inventory_purchase_items WHERE inventory_purchase_id = ?', [ctx.poId]);
      await q('DELETE FROM inventory_purchases WHERE id = ?', [ctx.poId]);
    }
    if (ctx.reqId) {
      await q('DELETE FROM inventory_request_approvals WHERE inventory_request_id = ?', [ctx.reqId]);
      await q('DELETE FROM inventory_request_details WHERE inventory_request_id = ?', [ctx.reqId]);
      await q('DELETE FROM inventory_requests WHERE id = ?', [ctx.reqId]);
    }
    if (ctx.procId) {
      await q('DELETE FROM inventory_procurement_items WHERE inventory_procurement_id = ?', [ctx.procId]);
      await q('DELETE FROM inventory_procurements WHERE id = ?', [ctx.procId]);
    }
    if (ctx.itemId) await q('DELETE FROM items WHERE id = ?', [ctx.itemId]);
    await db.end();
  });
});
