// Seed data minimal agar relasi employees terpenuhi (dibutuhkan modul
// Permintaan Pengadaan & Approval: inventory_procurements.created_by -> employees.id,
// dan employees.id -> users.id). Membuat 1 employee untuk SETIAP user (id sama
// dengan user.id, nama mengikuti nama user) + 1 organization_unit & employment_status.
//
// Murni DATA (idempoten, ON DUPLICATE KEY UPDATE) -- TIDAK mengubah skema DB.
// Jalankan: node scripts/seed_employees.js

const db = require('../lib/db');

async function seed() {
  const conn = await db.getConnection();
  try {
    console.log('=== Seed employees & dependensi ===');
    // organization_unit punya FK self-reference (organization_unit_id), jadi
    // saat memasukkan baris pertama, FK check dimatikan sementara di koneksi ini.
    await conn.query('SET FOREIGN_KEY_CHECKS=0');

    const [org] = await conn.query('SELECT id FROM organization_units WHERE id = 1');
    if (org.length === 0) {
      await conn.query(
        `INSERT INTO organization_units (id, name, code, parent_id, type, description, organization_unit_id, created_at, updated_at)
         VALUES (1, 'Fakultas Teknologi Informasi', 'FTI', NULL, 'faculty', 'FTI Unand', 1, NOW(), NOW())`
      );
      console.log('+ organization_unit "FTI" dibuat (id 1)');
    } else {
      console.log('= organization_unit id 1 sudah ada');
    }

    const [st] = await conn.query('SELECT id FROM employment_statuses WHERE id = 1');
    if (st.length === 0) {
      await conn.query(
        `INSERT INTO employment_statuses (id, name, description, created_at, updated_at)
         VALUES (1, 'PNS', 'Pegawai Negeri Sipil', NOW(), NOW())`
      );
      console.log('+ employment_status "PNS" dibuat (id 1)');
    } else {
      console.log('= employment_status id 1 sudah ada');
    }

    // Satu employee per user (id employee = id user, sesuai FK employees.id -> users.id).
    const [users] = await conn.query('SELECT id, name FROM users ORDER BY id ASC');
    for (const u of users) {
      await conn.query(
        `INSERT INTO employees
           (id, employee_number, name, birth_place, birth_date, gender, marital_status, address,
            organization_unit_id, hire_date, employment_status_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Padang', '2000-01-01', 'male', 'single', 'Kampus Unand, Limau Manis',
            1, '2024-01-01', 1, 'active', NOW(), NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()`,
        [u.id, 'EMP' + String(u.id).padStart(4, '0'), u.name]
      );
      console.log(`+ employee #${u.id} (${u.name})`);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    console.log('=== Selesai. employees siap dipakai modul pengadaan & approval. ===');
  } catch (err) {
    console.error('Gagal seed employees:', err.code || err.message);
  } finally {
    conn.release();
    await db.end();
  }
}

seed();
