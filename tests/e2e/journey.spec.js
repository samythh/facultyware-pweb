// Satu test "perjalanan" yang menelusuri seluruh alur aplikasi dalam satu
// sesi -> menghasilkan SATU video utuh (video.webm).
//
// Jalankan hanya video ini:
//   npx playwright test journey.spec.js
// Videonya: test-results/journey-*/video.webm
const { test, expect } = require('@playwright/test');
const { USERS } = require('./helpers');

// Jeda kecil supaya pergerakan terlihat jelas di video.
const beat = (page, ms = 900) => page.waitForTimeout(ms);

async function loginAs(page, role) {
  const u = USERS[role];
  await page.goto('/login');
  await beat(page, 500);
  await page.fill('#email', u.email);
  await page.fill('#password', u.password);
  await beat(page, 400);
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
  await beat(page);
}

test('full flow', async ({ page }) => {
  // ── Admin ──────────────────────────────────────────────────────────
  await loginAs(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aktivitas Terbaru' })).toBeVisible();
  await beat(page);

  for (const path of ['/procurement', '/pengadaan', '/purchase', '/supplier']) {
    await page.goto(path);
    await beat(page);
    const sel = page.locator('#sort-select');
    if (await sel.count()) {
      const opt = await sel.locator('option').nth(1).getAttribute('value');
      await sel.selectOption(opt);
      await page.waitForURL(new RegExp(`sort=${opt}`));
      await beat(page);
    }
  }

  await page.goto('/receiving');
  await beat(page);

  await page.goto('/logout');
  await beat(page, 600);

  // ── Wadir ──────────────────────────────────────────────────────────
  await loginAs(page, 'wadir');
  for (const path of ['/approval/inbox', '/approval/po', '/approval/po/archive']) {
    await page.goto(path);
    await beat(page);
  }

  await page.goto('/logout');
  await beat(page, 600);
  await expect(page).toHaveURL(/\/login/);
});
