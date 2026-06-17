const { test, expect } = require('@playwright/test');
const { USERS, login } = require('./helpers');

test.describe('auth', () => {
  test('login admin', async ({ page }) => {
    await login(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('login wadir', async ({ page }) => {
    await login(page, 'wadir');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('login invalid', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', USERS.admin.email);
    await page.fill('#password', 'password-salah');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert')).toBeVisible();
    await expect(page.locator('.alert')).toContainText(/salah/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('guard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/logout');
    await expect(page).toHaveURL(/\/login/);
  });
});
