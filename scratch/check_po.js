const db = require('../lib/db');
async function run() {
  const [purchases] = await db.query('SELECT * FROM inventory_purchases');
  console.log('Purchases in DB:', purchases);
  const [procurements] = await db.query('SELECT * FROM inventory_procurements');
  console.log('Procurements in DB:', procurements);
  process.exit(0);
}
run();
