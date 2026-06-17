const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Dashboard', () => {
  test('menampilkan kartu statistik & log aktivitas (admin)', async ({ page }) => {
    await login(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Total Permintaan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Menunggu Approval' })).toBeVisible();

    // Kartu "Aktivitas Terbaru" hasil fitur log per-role.
    const aktivitas = page.getByRole('heading', { name: 'Aktivitas Terbaru' });
    await expect(aktivitas).toBeVisible();

    // Card 'Menunggu Approval' tidak lagi memuat teks "Tidak ada antrean".
    await expect(page.locator('body')).not.toContainText('Tidak ada antrean');
  });

  test('dashboard wadir juga menampilkan log aktivitas', async ({ page }) => {
    await login(page, 'wadir');
    await expect(page.getByRole('heading', { name: 'Aktivitas Terbaru' })).toBeVisible();
  });
});
