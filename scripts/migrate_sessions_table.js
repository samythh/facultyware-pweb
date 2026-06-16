// Migration tabel penyimpanan sesi login (express-session via express-mysql-session).
//
// Kenapa tabel sendiri (express_sessions), bukan tabel `sessions` bawaan?
//   DB ini bergaya Laravel: tabel `sessions` Laravel berkolom
//   (id, user_id, ip_address, user_agent, payload, last_activity) -- BERBEDA
//   dari yang dibutuhkan express-mysql-session (session_id, expires, data).
//   Maka sesi Express disimpan di tabel terpisah `express_sessions` agar
//   TIDAK mengganggu tabel `sessions` Laravel.
//
// Tabel ini = infrastruktur (gudang sesi login), BUKAN data bisnis.
// Skema mengikuti default express-mysql-session.
//
// Idempotent: pakai CREATE TABLE IF NOT EXISTS.
// Jalankan: node scripts/migrate_sessions_table.js

const pool = require("../lib/db");

async function main() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS express_sessions (
       session_id varchar(128) COLLATE utf8mb4_bin NOT NULL,
       expires int(11) unsigned NOT NULL,
       data mediumtext COLLATE utf8mb4_bin,
       PRIMARY KEY (session_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`
  );
  console.log("+ tabel express_sessions siap (dibuat bila belum ada).");

  console.log("Migration tabel sesi selesai.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration gagal:", err.message);
  process.exit(1);
});
