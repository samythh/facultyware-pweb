// Jalur "gagal"/percabangan negatif: login salah, ACL lintas-role (403),
// 404, sort tak valid, dan kunci penerimaan setelah final (fix D).
const { test, expect } = require('@playwright/test');
const { USERS, login } = require('./helpers');

test.describe('negatives', () => {
  test('login wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', USERS.wadir.email);
    await page.fill('#password', 'salah-banget');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert')).toContainText(/salah/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('login unknown email', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'bukan-user@unand.ac.id');
    await page.fill('#password', 'apa-saja');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert')).toContainText(/salah/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('wadir 403 modul operasional', async ({ page }) => {
    await login(page, 'wadir');
    for (const path of ['/procurement', '/pengadaan', '/purchase', '/supplier', '/receiving']) {
      const resp = await page.goto(path);
      expect(resp.status(), `akses ${path}`).toBe(403);
    }
  });

  test('admin 403 persetujuan PO', async ({ page }) => {
    await login(page, 'admin');
    const resp = await page.goto('/approval/po');
    expect(resp.status()).toBe(403);
  });

  test('detail PO tidak ada -> 404', async ({ page }) => {
    await login(page, 'admin');
    const resp = await page.goto('/purchase/99999999');
    expect(resp.status()).toBe(404);
  });

  test('sort tak valid fallback ke default', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/purchase?sort=ngawur');
    await expect(page.locator('#sort-select')).toHaveValue('terbaru');
  });

  test('penerimaan final mengunci retur & barang ganti', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/receiving?sort=status');
    const doneRow = page.locator('tbody tr', { hasText: 'Selesai' }).first();
    if (!(await doneRow.count())) {
      test.skip(true, 'Tidak ada PO selesai untuk diuji.');
    }
    await doneRow.getByRole('link', { name: 'Detail' }).click();
    await expect(page).toHaveURL(/\/receiving\/\d+\/detail$/);
    await expect(page.getByText(/Penerimaan sudah final/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Catat Retur' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Konfirmasi Final' })).toHaveCount(0);
  });
});
