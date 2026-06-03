const db = require('../lib/db');

async function test() {
  console.log('--- STARTING PROCUREMENT FLOW TEST ON NEW TABLES ---');
  try {
    // 1. Verify employee exists
    const [employees] = await db.query('SELECT * FROM employees WHERE id = 1');
    if (employees.length === 0) {
      throw new Error('Test employee id = 1 not found in DB. Make sure setup_test_data.js was executed.');
    }
    console.log('✓ Found test employee in DB:', employees[0].name);

    // 2. Clear previous tests
    await db.query('DELETE FROM permintaan_items WHERE permintaan_pengadaan_id IN (SELECT id FROM permintaan_pengadaan WHERE request_number LIKE "PRQ-TEST-%")');
    await db.query('DELETE FROM permintaan_pengadaan WHERE request_number LIKE "PRQ-TEST-%"');
    console.log('✓ Cleared previous test procurements.');

    // 3. Create a test draft
    const requestNumber = 'PRQ-TEST-0001';
    console.log('Testing Draft Creation...');
    const [result] = await db.query(
      `INSERT INTO permintaan_pengadaan (request_number, title, status, created_by, employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [requestNumber, 'Pengadaan Laptop Test', 'draft', 1, 1]
    );
    const testId = result.insertId;
    console.log('✓ Header created with ID:', testId);

    // Insert item
    await db.query(
      `INSERT INTO permintaan_items (permintaan_pengadaan_id, item_name, quantity, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [testId, 'Asus ROG', 2]
    );
    console.log('✓ Item added to draft.');

    // 4. Verify draft exists and fields match
    const [draftRows] = await db.query('SELECT * FROM permintaan_pengadaan WHERE id = ?', [testId]);
    if (draftRows.length === 0 || draftRows[0].status !== 'draft') {
      throw new Error('Draft verification failed.');
    }
    const [itemRows] = await db.query('SELECT * FROM permintaan_items WHERE permintaan_pengadaan_id = ?', [testId]);
    if (itemRows.length === 0 || itemRows[0].item_name !== 'Asus ROG' || itemRows[0].quantity !== 2) {
      throw new Error('Items verification failed.');
    }
    console.log('✓ Draft and items verification successful!');

    // 5. Test Submission (Draft to Submitted)
    console.log('Testing submission workflow...');
    const [subRows] = await db.query('SELECT status FROM permintaan_pengadaan WHERE id = ?', [testId]);
    if (subRows[0].status !== 'draft') {
      throw new Error('Requisition is not draft before submission.');
    }

    await db.query(
      "UPDATE permintaan_pengadaan SET status = 'submitted', updated_at = NOW() WHERE id = ?",
      [testId]
    );

    const [subRowsAfter] = await db.query('SELECT status FROM permintaan_pengadaan WHERE id = ?', [testId]);
    if (subRowsAfter[0].status !== 'submitted') {
      throw new Error('Status transition to submitted failed.');
    }
    console.log('✓ Submission workflow successful! Requisition status is now:', subRowsAfter[0].status);

    // 6. Clean up
    await db.query('DELETE FROM permintaan_items WHERE permintaan_pengadaan_id = ?', [testId]);
    await db.query('DELETE FROM permintaan_pengadaan WHERE id = ?', [testId]);
    console.log('✓ Cleaned up test data.');
    console.log('--- ALL TESTS COMPLETED SUCCESSFULLY! ---');
    process.exit(0);
  } catch (error) {
    console.error('✗ TEST FAILED:', error.message);
    process.exit(1);
  }
}

test();
