// Validasi masukan / jalur "gagal isi" pada form.
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Validasi masukan', () => {
  test('menolak masuk ketika email dikosongkan', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert')).toContainText(/wajib diisi/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('menolak masuk ketika kata sandi dikosongkan', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@unand.ac.id');
    await page.click('button[type="submit"]');
    await expect(page.locator('.alert')).toContainText(/wajib diisi/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('menolak pembuatan PO ketika field wajib belum diisi', async ({ page }) => {
    await login(page, 'admin');
    const resp = await page.request.post('/purchase/create', { form: {} });
    expect(resp.ok()).toBeTruthy();
    expect(await resp.text()).toContain('Field wajib diisi');
  });

  test('menolak pencatatan retur ketika jumlahnya nol', async ({ page }) => {
    await login(page, 'admin');
    const resp = await page.request.post('/receiving/retur', {
      form: { po_id: '1', item_id: '1', quantity: '0' },
    });
    expect(resp.status()).toBe(400);
    expect(await resp.text()).toContain('tidak valid');
  });
});
