const db = require('../lib/db');

// Helper: Resolve logged-in user name to employee ID.
async function resolveEmployeeId(userId) {
  try {
    if (userId) {
      const [users] = await db.query('SELECT name FROM users WHERE id = ?', [userId]);
      if (users.length > 0) {
        const [employees] = await db.query('SELECT id FROM employees WHERE name = ? LIMIT 1', [users[0].name]);
        if (employees.length > 0) {
          return employees[0].id;
        }
      }
    }
    const [any] = await db.query('SELECT id FROM employees ORDER BY id ASC LIMIT 1');
    if (any.length > 0) {
      return any[0].id;
    }
  } catch (error) {
    console.error('Error resolving employee ID:', error);
  }
  return null;
}

// GET /pengadaan -> index
exports.index = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let query = `
      SELECT p.*, r.request_date, e_req.name AS requester_name, e_proc.name AS creator_name
      FROM inventory_procurements p
      LEFT JOIN inventory_requests r ON p.request_number = r.request_number
      LEFT JOIN employees e_req ON r.employee_id = e_req.id
      LEFT JOIN employees e_proc ON p.employee_id = e_proc.id
    `;
    let queryParams = [];

    if (search) {
      query += ` WHERE p.request_number LIKE ? OR p.title LIKE ?`;
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.id DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const [procurements] = await db.query(query, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM inventory_procurements p
    `;
    let countParams = [];

    if (search) {
      countQuery += ` WHERE p.request_number LIKE ? OR p.title LIKE ?`;
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [countRows] = await db.query(countQuery, countParams);
    const totalItems = countRows[0].total;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    res.render('pengadaan/index', {
      title: 'Daftar Pengadaan Barang',
      user: req.session.username,
      procurements,
      search,
      currentPage: page,
      totalPages,
      limit
    });
  } catch (error) {
    next(error);
  }
};

// GET /pengadaan/create -> form
exports.create = async (req, res, next) => {
  try {
    // Tampilkan permintaan ber-status='approved' yang belum punya pengadaan
    const query = `
      SELECT r.*, e.name AS requester_name,
             COALESCE(
               (SELECT item_name FROM inventory_request_details WHERE inventory_request_id = r.id LIMIT 1), 
               'Permintaan Barang'
             ) AS first_item_name
      FROM inventory_requests r
      LEFT JOIN employees e ON r.employee_id = e.id
      LEFT JOIN inventory_procurements p ON r.request_number = p.request_number
      WHERE r.status = 'approved' AND p.id IS NULL
      ORDER BY r.id DESC
    `;

    const [requests] = await db.query(query);

    res.render('pengadaan/create', {
      title: 'Buat Pengadaan Baru',
      user: req.session.username,
      requests,
      error: null
    });
  } catch (error) {
    next(error);
  }
};

// POST /pengadaan/create -> store
exports.store = async (req, res, next) => {
  const { request_number, title } = req.body;
  const currentEmployeeId = await resolveEmployeeId(req.session.userId);

  if (!request_number) {
    try {
      const [requests] = await db.query(`
        SELECT r.*, e.name AS requester_name
        FROM inventory_requests r
        LEFT JOIN employees e ON r.employee_id = e.id
        LEFT JOIN inventory_procurements p ON r.request_number = p.request_number
        WHERE r.status = 'approved' AND p.id IS NULL
        ORDER BY r.id DESC
      `);
      return res.render('pengadaan/create', {
        title: 'Buat Pengadaan Baru',
        user: req.session.username,
        requests,
        error: 'Pilih nomor permintaan asal terlebih dahulu.'
      });
    } catch (err) {
      return next(err);
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Pastikan request valid dan status approved, dan belum diproses pengadaan
    const [reqRows] = await conn.execute(
      `SELECT r.id, r.employee_id, r.request_number 
       FROM inventory_requests r
       LEFT JOIN inventory_procurements p ON r.request_number = p.request_number
       WHERE r.request_number = ? AND r.status = 'approved' AND p.id IS NULL`,
      [request_number]
    );

    if (reqRows.length === 0) {
      throw new Error('Permintaan tidak ditemukan, tidak berstatus disetujui, atau sudah memiliki pengadaan.');
    }

    const requestObj = reqRows[0];
    const procTitle = (title && title.trim()) || `Pengadaan untuk Permintaan ${request_number}`;

    // Buat pengadaan baru di inventory_procurements
    const [procResult] = await conn.execute(
      `INSERT INTO inventory_procurements (request_number, title, status, created_by, employee_id, created_at, updated_at)
       VALUES (?, ?, 'submitted', ?, ?, NOW(), NOW())`,
      [request_number, procTitle, currentEmployeeId, currentEmployeeId]
    );

    const procurementId = procResult.insertId;

    // Salin item dari inventory_request_details ke inventory_procurement_items
    const [itemRows] = await conn.execute(
      'SELECT item_id, item_name, quantity FROM inventory_request_details WHERE inventory_request_id = ?',
      [requestObj.id]
    );

    for (const item of itemRows) {
      await conn.execute(
        `INSERT INTO inventory_procurement_items (inventory_procurement_id, item_id, item_name, quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [procurementId, item.item_id, item.item_name, item.quantity]
      );
    }

    await conn.commit();
    res.redirect('/pengadaan');
  } catch (error) {
    await conn.rollback();
    console.error('Error saving procurement:', error);
    try {
      const [requests] = await db.query(`
        SELECT r.*, e.name AS requester_name
        FROM inventory_requests r
        LEFT JOIN employees e ON r.employee_id = e.id
        LEFT JOIN inventory_procurements p ON r.request_number = p.request_number
        WHERE r.status = 'approved' AND p.id IS NULL
        ORDER BY r.id DESC
      `);
      res.render('pengadaan/create', {
        title: 'Buat Pengadaan Baru',
        user: req.session.username,
        requests,
        error: error.message
      });
    } catch (err) {
      next(err);
    }
  } finally {
    conn.release();
  }
};

// GET /pengadaan/:id -> detail
exports.detail = async (req, res, next) => {
  const { id } = req.params;

  try {
    const [procurementRows] = await db.query(
      `SELECT p.*, r.request_date, e_req.name AS requester_name, e_proc.name AS creator_name
       FROM inventory_procurements p
       LEFT JOIN inventory_requests r ON p.request_number = r.request_number
       LEFT JOIN employees e_req ON r.employee_id = e_req.id
       LEFT JOIN employees e_proc ON p.employee_id = e_proc.id
       WHERE p.id = ?`,
      [id]
    );

    if (procurementRows.length === 0) {
      return res.status(404).render('error', {
        message: 'Data pengadaan tidak ditemukan.',
        error: { status: 404, stack: '' }
      });
    }

    const procurement = procurementRows[0];

    const [items] = await db.query(
      `SELECT pi.*, i.code AS item_code
       FROM inventory_procurement_items pi
       LEFT JOIN items i ON pi.item_id = i.id
       WHERE pi.inventory_procurement_id = ?
       ORDER BY pi.id ASC`,
      [id]
    );

    res.render('pengadaan/detail', {
      title: `Detail Pengadaan ${procurement.request_number}`,
      user: req.session.username,
      procurement,
      items
    });
  } catch (error) {
    next(error);
  }
};

// POST /pengadaan/:id/approve -> approve
exports.approve = async (req, res, next) => {
  const { id } = req.params;
  try {
    await db.query(
      `UPDATE inventory_procurements 
       SET status = 'approved', approved_at = NOW(), updated_at = NOW() 
       WHERE id = ? AND status = 'submitted'`,
      [id]
    );
    res.redirect(`/pengadaan/${id}`);
  } catch (error) {
    next(error);
  }
};

// POST /pengadaan/:id/reject -> reject
exports.reject = async (req, res, next) => {
  const { id } = req.params;
  try {
    await db.query(
      `UPDATE inventory_procurements 
       SET status = 'rejected', updated_at = NOW() 
       WHERE id = ? AND status = 'submitted'`,
      [id]
    );
    res.redirect(`/pengadaan/${id}`);
  } catch (error) {
    next(error);
  }
};

// GET /pengadaan/api/request/:requestNumber/items -> AJAX lookup
exports.requestItems = async (req, res, next) => {
  try {
    const { requestNumber } = req.params;
    const [requestRows] = await db.query(
      'SELECT id FROM inventory_requests WHERE request_number = ?',
      [requestNumber]
    );
    if (requestRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Permintaan tidak ditemukan.' });
    }
    const [items] = await db.query(
      'SELECT item_id, item_name as name, quantity FROM inventory_request_details WHERE inventory_request_id = ? ORDER BY id ASC',
      [requestRows[0].id]
    );
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
