const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('sort', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  for (const path of ['/purchase', '/pengadaan', '/procurement', '/supplier']) {
    test(`sort ${path}`, async ({ page }) => {
      await page.goto(path);
      const sel = page.locator('#sort-select');
      await expect(sel).toBeVisible();

      const second = await sel.locator('option').nth(1).getAttribute('value');
      await Promise.all([
        page.waitForURL(new RegExp(`sort=${second}`)),
        sel.selectOption(second),
      ]);
      await expect(page).toHaveURL(new RegExp(`sort=${second}`));
      await expect(page.locator('#sort-select')).toHaveValue(second);
    });
  }

  test('search purchase', async ({ page }) => {
    await page.goto('/purchase');
    await expect(page.locator('input[type="text"][name="search"]')).toBeVisible();
    const pager = page.getByText(/Halaman \d+ dari \d+/);
    if (await pager.count()) {
      await expect(pager.first()).toBeVisible();
    }
  });
});
