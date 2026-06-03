const db = require('../lib/db');
async function run() {
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  await db.query('TRUNCATE TABLE inventory_purchase_items');
  await db.query('TRUNCATE TABLE inventory_purchases');
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('Purchase tables truncated successfully. Dropdown should have REQ-001 again.');
  process.exit(0);
}
run();
