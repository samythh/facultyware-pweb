// Alur penuh pengadaan lewat INTERAKSI BROWSER (klik / isi form) supaya video
// Playwright menampilkan semua aksi.  File ini melengkapi alur-penuh.spec.js
// yang memakai page.request (HTTP langsung) untuk verifikasi cepat.
//
// Test ini MENULIS data lalu MEMBERSIHKANNYA sendiri lewat DB (afterAll).
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');
const db = require('../../lib/db');

// Jeda singkat agar video enak ditonton.
const beat = (page, ms = 800) => page.waitForTimeout(ms);

test.describe('Alur penuh pengadaan (UI)', () => {
   const ctx = {};
   const stamp = Date.now();
   const judulPermintaan = `E2E UI Permintaan ${stamp}`;
   const judulPengadaan = `E2E UI Pengadaan ${stamp}`;
   const namaBarang = `Barang UI ${stamp}`;

   test('admin & wakil dekan menjalankan pengadaan sampai barang ganti menutup cacat', async ({ page }) => {
      test.setTimeout(180_000);

      // ── 1. Login admin ──────────────────────────────────────────────
      await login(page, 'admin');
      await beat(page);

      // ── 2. Buat permintaan ─────────────────────────────────────────
      await page.goto('/procurement/create');
      await expect(page).toHaveURL(/\/procurement\/create$/);
      await beat(page);

      await page.fill('#title', judulPermintaan);
      // Baris pertama otomatis ada saat halaman dimuat.
      await page.locator('input[name="item_name"]').first().fill(namaBarang);
      await page.locator('input[name="quantity"]').first().fill('5');
      await beat(page);

      await Promise.all([
         page.waitForURL('**/procurement', { timeout: 15_000 }),
         page.getByRole('button', { name: 'Kirim Permintaan' }).click(),
      ]);
      await expect(page).toHaveURL(/\/procurement$/);
      await beat(page);

      // Ambil request_number & id dari DB.
      let [rows] = await db.query(
         'SELECT id, request_number FROM inventory_requests WHERE title = ? ORDER BY id DESC LIMIT 1',
         [judulPermintaan],
      );
      expect(rows.length, 'permintaan tersimpan').toBe(1);
      ctx.reqId = rows[0].id;
      ctx.reqNumber = rows[0].request_number;

      // ── 3. Logout, login wadir ──────────────────────────────────────
      await page.goto('/logout');
      await page.waitForURL('**/login', { timeout: 10_000 });
      await beat(page);
      await login(page, 'wadir');
      await beat(page);

      // ── 4. Setujui permintaan ──────────────────────────────────────
      await page.goto(`/approval/${ctx.reqId}`);
      await expect(page.locator('h1')).toContainText('Detail Permintaan');
      await beat(page);

      // Buka dialog konfirmasi, lalu klik "Ya, Setujui".
      await page.getByRole('button', { name: 'Setujui Permintaan' }).click();
      await expect(page.locator('#dialog-approve')).toBeVisible();
      await beat(page, 500);

      await Promise.all([
         page.waitForURL('**/approval**', { timeout: 15_000 }),
         page.locator('#dialog-approve').getByRole('button', { name: 'Ya, Setujui' }).click(),
      ]);
      await beat(page);

      [rows] = await db.query('SELECT status FROM inventory_requests WHERE id = ?', [ctx.reqId]);
      expect(rows[0].status).toBe('approved');

      // ── 5. Logout, login admin ─────────────────────────────────────
      await page.goto('/logout');
      await page.waitForURL('**/login', { timeout: 10_000 });
      await beat(page);
      await login(page, 'admin');
      await beat(page);

      // ── 6. Konsolidasi pengadaan ───────────────────────────────────
      await page.goto('/pengadaan/create');
      await expect(page).toHaveURL(/\/pengadaan\/create$/);
      await beat(page);

      await page.fill('#title', judulPengadaan);
      // Centang checkbox permintaan yang baru disetujui.
      const chk = page.locator(`.req-check[value="${ctx.reqNumber}"]`);
      await expect(chk).toBeVisible({ timeout: 5_000 });
      await chk.check();
      await beat(page);

      await Promise.all([
         page.waitForURL('**/pengadaan', { timeout: 15_000 }),
         page.getByRole('button', { name: 'Simpan Pengadaan' }).click(),
      ]);
      await expect(page).toHaveURL(/\/pengadaan$/);
      await beat(page);

      [rows] = await db.query(
         'SELECT id FROM inventory_procurements WHERE title = ? ORDER BY id DESC LIMIT 1',
         [judulPengadaan],
      );
      expect(rows.length, 'pengadaan tersimpan').toBe(1);
      ctx.procId = rows[0].id;

      // ── 7. Buat PO ─────────────────────────────────────────────────
      await page.goto('/purchase/create');
      await expect(page).toHaveURL(/\/purchase\/create$/);
      await beat(page);

      // Pilih pengadaan yang baru dibuat.
      await page.locator('#procurement_id').selectOption(String(ctx.procId));
      // Tunggu tabel harga muncul (fetch async).
      const priceInput = page.locator('input[name="prices[]"]').first();
      await expect(priceInput).toBeVisible({ timeout: 10_000 });
      await beat(page);

      // Pilih supplier pertama yang tersedia.
      const supplierSelect = page.locator('#supplier_id');
      const opts = await supplierSelect.locator('option').all();
      // opts[0] = placeholder "-- Pilih Supplier --", pilih index 1.
      const supplierValue = await opts[1].getAttribute('value');
      await supplierSelect.selectOption(supplierValue);
      await beat(page, 400);

      // Isi tanggal & harga.
      const today = new Date().toISOString().slice(0, 10);
      await page.fill('#purchase_date', today);
      await priceInput.fill('15000');
      await beat(page);

      await Promise.all([
         page.waitForURL('**/purchase', { timeout: 15_000 }),
         page.getByRole('button', { name: 'Simpan PO' }).click(),
      ]);
      await expect(page).toHaveURL(/\/purchase$/);
      await beat(page);

      [rows] = await db.query(
         'SELECT id, purchase_number FROM inventory_purchases WHERE inventory_procurement_id = ? ORDER BY id DESC LIMIT 1',
         [ctx.procId],
      );
      expect(rows.length, 'PO tersimpan').toBe(1);
      ctx.poId = rows[0].id;
      ctx.poNumber = rows[0].purchase_number;

      // ── 8. Logout, login wadir → setujui PO ────────────────────────
      await page.goto('/logout');
      await page.waitForURL('**/login', { timeout: 10_000 });
      await beat(page);
      await login(page, 'wadir');
      await beat(page);

      // Buka detail PO lalu klik "Setujui PO" (form langsung, tanpa modal).
      await page.goto(`/purchase/${ctx.poId}`);
      await expect(page.locator('h1')).toContainText('Detail Purchase Order');
      await beat(page);

      await Promise.all([
         page.waitForURL('**/purchase/**', { timeout: 15_000 }),
         page.getByRole('button', { name: 'Setujui PO' }).click(),
      ]);
      await beat(page);

      [rows] = await db.query('SELECT status FROM inventory_purchases WHERE id = ?', [ctx.poId]);
      expect(rows[0].status).toBe('approved');

      // ── 9. Logout, login admin → verifikasi penerimaan ─────────────
      await page.goto('/logout');
      await page.waitForURL('**/login', { timeout: 10_000 });
      await beat(page);
      await login(page, 'admin');
      await beat(page);

      // Ambil id item penerimaan.
      const [pis] = await db.query(
         'SELECT id, item_id FROM inventory_purchase_items WHERE inventory_purchase_id = ?',
         [ctx.poId],
      );
      expect(pis.length).toBe(1);
      ctx.piId = pis[0].id;
      ctx.itemId = pis[0].item_id;

      // Buka halaman verifikasi.
      await page.goto(`/receiving/${ctx.poId}/verify`);
      await expect(page.locator('h1')).toContainText('Verifikasi Penerimaan');
      await beat(page);

      // Isi jumlah baik = 3 (otomatis cacat = 2 via JS).
      const goodInput = page.locator(`input[name="good_qty[${ctx.piId}]"]`);
      const defInput = page.locator(`input[name="defective_qty[${ctx.piId}]"]`);
      await expect(goodInput).toBeVisible();

      await goodInput.fill('3');
      await page.waitForTimeout(300); // tunggu JS recalc
      // Pastikan cacat otomatis jadi 2 (sisa = 5 - 3).
      await expect(defInput).toHaveValue('2');
      await beat(page);

      // Submit form verifikasi.
      await Promise.all([
         page.waitForURL('**/receiving/**', { timeout: 15_000 }),
         page.getByRole('button', { name: 'Simpan Verifikasi' }).click(),
      ]);
      await beat(page);

      // Verifikasi DB.
      [rows] = await db.query(
         'SELECT received_quantity, received_defective FROM inventory_purchase_items WHERE id = ?',
         [ctx.piId],
      );
      expect(Number(rows[0].received_quantity)).toBe(3);
      expect(Number(rows[0].received_defective)).toBe(2);

      // ── 10. Catat barang ganti ─────────────────────────────────────
      await page.goto(`/receiving/${ctx.poId}/detail`);
      await expect(page.locator('h1')).toContainText('Detail Penerimaan');
      await beat(page);

      // Buka dialog barang ganti.
      await page.getByRole('button', { name: 'Catat Barang Ganti' }).click();
      await expect(page.locator('#dialog-replacement')).toBeVisible();
      await beat(page, 500);

      // Isi form barang ganti.
      await page.locator('#repl-item').selectOption(String(ctx.itemId));
      await page.fill('#repl-qty', '2');
      await beat(page, 400);

      await Promise.all([
         page.waitForURL('**/receiving/**', { timeout: 15_000 }),
         page.locator('#dialog-replacement').getByRole('button', { name: 'Simpan Barang Ganti' }).click(),
      ]);
      await beat(page);

      // ── 11. Assert: cacat tertutup & riwayat barang ganti muncul ───
      await page.goto(`/receiving/${ctx.poId}/detail`);
      await expect(page.locator('h1')).toContainText('Detail Penerimaan');
      await beat(page);

      await expect(page.locator('.cond-cacat')).toHaveCount(0);
      await expect(page.getByText('Riwayat Barang Ganti')).toBeVisible();
      await beat(page);

      // ── 12. Penutup: kembali ke daftar penerimaan, lalu dashboard ──
      await page.goto('/receiving');
      await expect(page.locator('h1')).toContainText('Penerimaan Barang');
      await beat(page);

      await page.goto('/dashboard');
      await expect(page.locator('h1')).toContainText('Dashboard');
      await beat(page);
   });

   test.afterAll(async () => {
      const q = async (sql, p) => {
         try { await db.query(sql, p); } catch { /* abaikan saat bersih-bersih */ }
      };
      if (ctx.poNumber) {
         await q('DELETE FROM inventory_transactions WHERE reference = ?', [ctx.poNumber]);
      }
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
      if (ctx.itemId) {
         await q('DELETE FROM items WHERE id = ?', [ctx.itemId]);
      }
      await db.end();
   });
});
