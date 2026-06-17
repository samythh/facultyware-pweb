// Konfigurasi Playwright untuk E2E SIP FacultyWare.
// Menjalankan aplikasi Express (npm start) bila belum berjalan, lalu menguji
// alur utama di http://localhost:3000.
//
// Prasyarat: MySQL berjalan & seeding RBAC sudah dijalankan
//   node scripts/seed_rbac.js
// (akun: admin@unand.ac.id/admin123, wadir@unand.ac.id/wadir123).
//
// Menjalankan:  npx playwright test
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Rekam video tiap test. Opsi: 'on' (semua), 'retain-on-failure'
    // (simpan hanya yang gagal), 'off'. Override via env: VIDEO=retain-on-failure
    video: process.env.VIDEO || 'on',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Auto-start app bila belum jalan; pakai instance yang ada bila sudah jalan.
  webServer: {
    command: 'npm start',
    url: BASE_URL + '/login',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
