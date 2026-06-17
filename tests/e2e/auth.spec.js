const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Autentikasi', () => {
  test('admin dapat masuk lalu melihat dashboard', async ({ page }) => {
    await login(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('wakil dekan dapat masuk', async ({ page }) => {
    await login(page, 'wadir');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('menolak masuk ketika kata sandi salah', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@unand.ac.id');
    await page.fill('#password', 'kata-sandi-keliru');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert')).toContainText(/salah/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('mengarahkan ke halaman masuk ketika belum login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('pengguna dapat keluar dari akun', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/logout');
    await expect(page).toHaveURL(/\/login/);
  });
});
