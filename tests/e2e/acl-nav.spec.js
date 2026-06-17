const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('acl', () => {
  test('admin 403 approval', async ({ page }) => {
    await login(page, 'admin');
    const resp = await page.goto('/approval/inbox');
    expect(resp.status()).toBe(403);
    await expect(page.locator('body')).toContainText(/izin/i);
  });

  test('sidebar admin', async ({ page }) => {
    await login(page, 'admin');
    const sidebar = page.locator('#sidebar');
    await expect(sidebar.getByText('Purchase Order', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Permintaan Pengadaan', { exact: true })).toBeVisible();
  });

  test('sidebar wadir', async ({ page }) => {
    await login(page, 'wadir');
    const sidebar = page.locator('#sidebar');
    await expect(sidebar.getByText('Inbox Wakil Dekan', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Persetujuan Belanja (PO)', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Arsip PO', { exact: true })).toBeVisible();
  });
});
