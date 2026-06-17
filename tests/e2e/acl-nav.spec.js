const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Hak akses dan navigasi', () => {
  test('admin tidak diizinkan membuka halaman persetujuan', async ({ page }) => {
    await login(page, 'admin');
    const resp = await page.goto('/approval/inbox');
    expect(resp.status()).toBe(403);
    await expect(page.locator('body')).toContainText(/izin/i);
  });

  test('admin melihat menu operasional pada sidebar', async ({ page }) => {
    await login(page, 'admin');
    const sidebar = page.locator('#sidebar');
    await expect(sidebar.getByText('Purchase Order', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Permintaan Pengadaan', { exact: true })).toBeVisible();
  });

  test('wakil dekan melihat menu persetujuan pada sidebar', async ({ page }) => {
    await login(page, 'wadir');
    const sidebar = page.locator('#sidebar');
    await expect(sidebar.getByText('Inbox Wakil Dekan', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Persetujuan Belanja (PO)', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Arsip PO', { exact: true })).toBeVisible();
  });
});
