const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function run() {
  const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    multipleStatements: true
  }).promise();

  try {
    console.log('Altering users table to add username...');
    try {
      await connection.query('ALTER TABLE users ADD COLUMN username VARCHAR(255) NOT NULL UNIQUE AFTER name');
      console.log('Added username column to users table.');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Username column already exists.');
      } else {
        throw e;
      }
    }

    console.log('Creating user_has_roles view...');
    await connection.query('DROP VIEW IF EXISTS user_has_roles');
    await connection.query('CREATE VIEW user_has_roles AS SELECT role_id, model_id AS user_id FROM model_has_roles');
    console.log('Created user_has_roles view.');

    console.log('Inserting manage_procurement permission...');
    const [permRows] = await connection.query('SELECT * FROM permissions WHERE name = ?', ['manage_procurement']);
    let permId;
    if (permRows.length === 0) {
      const [res] = await connection.query('INSERT INTO permissions (name, guard_name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())', ['manage_procurement', 'web']);
      permId = res.insertId;
      console.log('Inserted manage_procurement permission.');
    } else {
      permId = permRows[0].id;
      console.log('Permission manage_procurement already exists.');
    }

    console.log('Inserting admin role...');
    const [roleRows] = await connection.query('SELECT * FROM roles WHERE name = ?', ['admin']);
    let roleId;
    if (roleRows.length === 0) {
      const [res] = await connection.query('INSERT INTO roles (name, guard_name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())', ['admin', 'web']);
      roleId = res.insertId;
      console.log('Inserted admin role.');
    } else {
      roleId = roleRows[0].id;
      console.log('Role admin already exists.');
    }

    console.log('Linking admin role and manage_procurement permission...');
    const [rhpRows] = await connection.query('SELECT * FROM role_has_permissions WHERE role_id = ? AND permission_id = ?', [roleId, permId]);
    if (rhpRows.length === 0) {
      await connection.query('INSERT INTO role_has_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, permId]);
      console.log('Linked admin role and manage_procurement permission.');
    } else {
      console.log('Link between admin and manage_procurement already exists.');
    }

    // Disable foreign key checks for setup
    await connection.query('SET FOREIGN_KEY_CHECKS=0');

    console.log('Creating organization unit...');
    const [orgRows] = await connection.query('SELECT * FROM organization_units WHERE id = 1');
    if (orgRows.length === 0) {
      await connection.query(`
        INSERT INTO organization_units (id, name, code, parent_id, type, description, organization_unit_id, created_at, updated_at)
        VALUES (1, 'Fakultas Teknologi Informasi', 'FTI', NULL, 'faculty', 'FTI Unand', 1, NOW(), NOW())
      `);
      console.log('Inserted test organization unit.');
    }

    console.log('Creating employment status...');
    const [statusRows] = await connection.query('SELECT * FROM employment_statuses WHERE id = 1');
    if (statusRows.length === 0) {
      await connection.query(`
        INSERT INTO employment_statuses (id, name, description, created_at, updated_at)
        VALUES (1, 'PNS', 'Pegawai Negeri Sipil', NOW(), NOW())
      `);
      console.log('Inserted test employment status.');
    }

    console.log('Creating test employee...');
    const [empRows] = await connection.query('SELECT * FROM employees WHERE name = ?', ['Nadila Lailany Numai']);
    let empId;
    if (empRows.length === 0) {
      const [res] = await connection.query(`
        INSERT INTO employees (id, employee_number, national_id_number, tax_id_number, name, birth_place, birth_date, gender, religion, marital_status, address, phone_number, organization_unit_id, hire_date, employment_status_id, status, created_at, updated_at)
        VALUES (1, 'EMP001', '1234567890', 'NPWP001', 'Nadila Lailany Numai', 'Padang', '2004-01-01', 'female', 'Islam', 'single', 'Jl. Limau Manis', '0812345678', 1, '2024-01-01', 1, 'active', NOW(), NOW())
      `);
      empId = res.insertId || 1;
      console.log('Inserted test employee.');
    } else {
      empId = empRows[0].id;
      console.log('Test employee already exists.');
    }

    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS=1');

    console.log('Creating test user...');
    const [userRows] = await connection.query('SELECT * FROM users WHERE username = ?', ['nadila']);
    let userId;
    if (userRows.length === 0) {
      const hashedPassword = await bcrypt.hash('password', 10);
      const [res] = await connection.query(`
        INSERT INTO users (name, username, email, password, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
      `, ['Nadila Lailany Numai', 'nadila', 'nadila@example.com', hashedPassword]);
      userId = res.insertId;
      console.log('Inserted test user "nadila" with password "password".');
    } else {
      userId = userRows[0].id;
      console.log('Test user "nadila" already exists.');
    }

    console.log('Linking user to role...');
    const [mhrRows] = await connection.query('SELECT * FROM model_has_roles WHERE role_id = ? AND model_id = ?', [roleId, userId]);
    if (mhrRows.length === 0) {
      await connection.query(`
        INSERT INTO model_has_roles (role_id, model_type, model_id)
        VALUES (?, ?, ?)
      `, [roleId, 'App\\Models\\User', userId]);
      console.log('Linked user to role admin.');
    } else {
      console.log('User role link already exists.');
    }

    console.log('Database test data setup successfully complete!');
  } catch (error) {
    console.error('Error setting up test data:', error);
  } finally {
    await connection.end();
  }
}

run();
