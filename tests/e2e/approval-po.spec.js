const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Persetujuan PO (gerbang 2) - Wadir', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'wadir');
  });

  test('antrean Persetujuan Belanja (PO) bisa dibuka', async ({ page }) => {
    await page.goto('/approval/po');
    await expect(page.getByRole('heading', { name: 'Persetujuan Belanja (PO)' })).toBeVisible();
    // Tabel memuat kolom Total (harga) khas gerbang sadar-harga.
    await expect(page.getByRole('columnheader', { name: 'Total' })).toBeVisible();
  });

  test('arsip Persetujuan PO bisa dibuka', async ({ page }) => {
    await page.goto('/approval/po/archive');
    await expect(page.getByRole('heading', { name: 'Arsip Persetujuan PO' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Penyetuju' })).toBeVisible();
  });

  test('wadir boleh membuka detail PO bila ada (manage_approval)', async ({ page }) => {
    await page.goto('/approval/po');
    const firstDetail = page.getByRole('link', { name: 'Tinjau' }).first();
    if (await firstDetail.count()) {
      await firstDetail.click();
      await expect(page).toHaveURL(/\/purchase\/\d+$/);
      await expect(page.getByText('Nomor Purchase Order')).toBeVisible();
    } else {
      test.skip(true, 'Tidak ada PO pending untuk diuji.');
    }
  });
});
