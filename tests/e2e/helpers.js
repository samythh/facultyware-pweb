// Helper bersama untuk E2E: kredensial & fungsi login.
const { expect } = require('@playwright/test');

const USERS = {
  admin: { email: 'admin@unand.ac.id', password: 'admin123' },
  wadir: { email: 'wadir@unand.ac.id', password: 'wadir123' },
};

// Login lewat form /login lalu tunggu redirect ke /dashboard.
async function login(page, role = 'admin') {
  const u = USERS[role];
  await page.goto('/login');
  await page.fill('#email', u.email);
  await page.fill('#password', u.password);
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
  await expect(page).toHaveURL(/\/dashboard$/);
}

module.exports = { USERS, login };
