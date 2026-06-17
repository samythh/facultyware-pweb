// Skenario gagal & hak akses (selain login kosong/validasi form yang ada di validasi.spec.js).
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Skenario gagal dan hak akses', () => {
  test('menolak masuk dengan email yang tidak terdaftar', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'bukan-user@unand.ac.id');
    await page.fill('#password', 'apa-saja');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert')).toContainText(/salah/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('melarang wakil dekan membuka modul operasional', async ({ page }) => {
    await login(page, 'wadir');
    for (const path of ['/procurement', '/pengadaan', '/purchase', '/supplier', '/receiving']) {
      const resp = await page.goto(path);
      expect(resp.status(), `akses ${path}`).toBe(403);
    }
  });

  test('melarang admin membuka persetujuan PO', async ({ page }) => {
    await login(page, 'admin');
    const resp = await page.goto('/approval/po');
    expect(resp.status()).toBe(403);
  });

  test('menampilkan halaman 404 ketika detail PO tidak ada', async ({ page }) => {
    await login(page, 'admin');
    const resp = await page.goto('/purchase/99999999');
    expect(resp.status()).toBe(404);
  });

  test('kembali ke urutan default ketika parameter urutkan tidak valid', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/purchase?sort=ngawur');
    await expect(page.locator('#sort-select')).toHaveValue('terbaru');
  });

  test('mengunci retur dan barang ganti setelah penerimaan dinyatakan final', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/receiving?sort=status');
    const doneRow = page.locator('tbody tr', { hasText: 'Selesai' }).first();
    if (!(await doneRow.count())) {
      test.skip(true, 'Tidak ada penerimaan yang sudah selesai untuk diuji.');
    }
    await doneRow.getByRole('link', { name: 'Detail' }).click();
    await expect(page).toHaveURL(/\/receiving\/\d+\/detail$/);
    await expect(page.getByText(/Penerimaan sudah final/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Catat Retur' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Konfirmasi Final' })).toHaveCount(0);
  });
});
