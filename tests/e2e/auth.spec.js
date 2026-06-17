const { test, expect } = require('@playwright/test');
const { USERS, login } = require('./helpers');

test.describe('Autentikasi', () => {
  test('login admin berhasil dan diarahkan ke dashboard', async ({ page }) => {
    await login(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('login wadir berhasil', async ({ page }) => {
    await login(page, 'wadir');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('login gagal menampilkan pesan kesalahan', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', USERS.admin.email);
    await page.fill('#password', 'password-salah');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert')).toBeVisible();
    await expect(page.locator('.alert')).toContainText(/salah/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('akses dashboard tanpa login dialihkan ke login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout mengembalikan ke halaman login', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/logout');
    await expect(page).toHaveURL(/\/login/);
  });
});
