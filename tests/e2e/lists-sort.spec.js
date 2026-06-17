const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Fitur Urutkan (sort) di halaman daftar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  for (const path of ['/purchase', '/pengadaan', '/procurement', '/supplier']) {
    test(`dropdown urutkan tersedia & mengubah URL di ${path}`, async ({ page }) => {
      await page.goto(path);
      const sel = page.locator('#sort-select');
      await expect(sel).toBeVisible();

      // Pilih opsi kedua; form auto-submit (onchange) -> URL memuat ?sort=...
      const second = await sel.locator('option').nth(1).getAttribute('value');
      await Promise.all([
        page.waitForURL(new RegExp(`sort=${second}`)),
        sel.selectOption(second),
      ]);
      await expect(page).toHaveURL(new RegExp(`sort=${second}`));
      // Pilihan tetap dipertahankan setelah reload navigasi.
      await expect(page.locator('#sort-select')).toHaveValue(second);
    });
  }

  test('halaman /purchase memiliki kontrol pencarian & (jika ada) pagination konsisten', async ({ page }) => {
    await page.goto('/purchase');
    await expect(page.locator('input[type="text"][name="search"]')).toBeVisible();
    // Pagination muncul hanya bila > 1 halaman; bila ada, tombol nav tersedia.
    const pager = page.getByText(/Halaman \d+ dari \d+/);
    if (await pager.count()) {
      await expect(pager.first()).toBeVisible();
    }
  });
});
