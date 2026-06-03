const db = require('../lib/db');
const bcrypt = require('bcryptjs');

async function init() {
  try {
    console.log('Starting database initialization (clean setup with BIGINT users.id)...');

    // Disable foreign key checks during the setup
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('Foreign key checks disabled.');

    // Drop tables if they exist to avoid schema mismatches
    await db.query('DROP TABLE IF EXISTS inventory_purchase_items');
    await db.query('DROP TABLE IF EXISTS inventory_purchases');
    await db.query('DROP TABLE IF EXISTS inventory_procurement_items');
    await db.query('DROP TABLE IF EXISTS inventory_procurements');
    await db.query('DROP TABLE IF EXISTS items');
    await db.query('DROP TABLE IF EXISTS users');
    console.log('Old tables dropped successfully.');

    // 1. Create users table with BIGINT UNSIGNED id
    await db.query(`
      CREATE TABLE users (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table created.');

    // Seed admin user
    const hashedPassword = await bcrypt.hash('password', 10);
    await db.query('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
    console.log('Test user "admin" created with password "password".');

    // 2. Create items table
    await db.query(`
      CREATE TABLE items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(255) NOT NULL UNIQUE,
        unit VARCHAR(255) NOT NULL,
        minimal_quantity INT NOT NULL DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Items table created.');

    // 3. Create inventory_procurements table
    await db.query(`
      CREATE TABLE inventory_procurements (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        request_number VARCHAR(255) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        status ENUM('draft','submitted','approved','rejected') NOT NULL,
        created_by BIGINT UNSIGNED NOT NULL,
        approved_at TIMESTAMP NULL,
        employee_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Inventory Procurements table created.');

    // 4. Create inventory_procurement_items table
    await db.query(`
      CREATE TABLE inventory_procurement_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        inventory_procurement_id BIGINT UNSIGNED NOT NULL,
        item_id BIGINT UNSIGNED NULL,
        item_name VARCHAR(255) NULL,
        quantity INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Inventory Procurement Items table created.');

    // 5. Create inventory_purchases table
    await db.query(`
      CREATE TABLE inventory_purchases (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        purchase_number VARCHAR(255) NOT NULL UNIQUE,
        inventory_procurement_id BIGINT UNSIGNED NULL,
        purchase_date DATE NOT NULL,
        supplier VARCHAR(255) NULL,
        status ENUM('draft','completed') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Inventory Purchases table created.');

    // 6. Create inventory_purchase_items table
    await db.query(`
      CREATE TABLE inventory_purchase_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        inventory_purchase_id BIGINT UNSIGNED NOT NULL,
        item_id BIGINT UNSIGNED NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(12,2) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Inventory Purchase Items table created.');

    // Seed items
    await db.query(`
      INSERT INTO items (name, code, unit, minimal_quantity, description) VALUES
      ('Pensil', 'ITM001', 'pcs', 10, 'Alat tulis pensil'),
      ('Buku', 'ITM002', 'pcs', 5, 'Buku tulis'),
      ('Penghapus', 'ITM003', 'pcs', 5, 'Penghapus karet')
    `);
    console.log('Dummy items seeded.');

    // Seed approved procurement & items
    // Create an approved procurement
    const [procResult] = await db.query(`
      INSERT INTO inventory_procurements (request_number, title, status, created_by, employee_id)
      VALUES ('REQ-001', 'Pengadaan Alat Tulis Kantor', 'approved', 1, 1)
    `);
    
    const procurementId = procResult.insertId;

    // Seed items for this procurement
    const [itemRows] = await db.query('SELECT id, name FROM items WHERE name IN ("Pensil", "Buku")');
    const pensil = itemRows.find(i => i.name === 'Pensil');
    const buku = itemRows.find(i => i.name === 'Buku');

    await db.query(`
      INSERT INTO inventory_procurement_items (inventory_procurement_id, item_id, item_name, quantity) VALUES
      (?, ?, 'Pensil', 10),
      (?, ?, 'Buku', 5)
    `, [procurementId, pensil ? pensil.id : 1, procurementId, buku ? buku.id : 2]);
    
    console.log('Dummy approved procurement and items seeded.');

    // Re-enable foreign key checks at the very end
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Foreign key checks re-enabled.');

    console.log('Database initialization and seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    // Re-enable FK checks if something crashed during the transaction
    try { await db.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) {}
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

init();
