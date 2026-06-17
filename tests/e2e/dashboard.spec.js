const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('dashboard', () => {
  test('admin', async ({ page }) => {
    await login(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Total Permintaan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Menunggu Approval' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aktivitas Terbaru' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Tidak ada antrean');
  });

  test('wadir', async ({ page }) => {
    await login(page, 'wadir');
    await expect(page.getByRole('heading', { name: 'Aktivitas Terbaru' })).toBeVisible();
  });
});
