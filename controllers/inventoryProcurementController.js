const db = require('../lib/db');
const PDFDocument = require('pdfkit');

// Helper: Resolve logged-in user name to employee ID
async function resolveEmployeeId(userId) {
  let employeeId = 1; // Default fallback to test employee
  try {
    const [users] = await db.query('SELECT name FROM users WHERE id = ?', [userId]);
    if (users.length > 0) {
      const [employees] = await db.query('SELECT id FROM employees WHERE name = ?', [users[0].name]);
      if (employees.length > 0) {
        employeeId = employees[0].id;
      }
    }
  } catch (error) {
    console.error('Error resolving employee ID:', error);
  }
  return employeeId;
}

// Helper: Generate sequential request number (PRQ-YYYYMMDD-XXXX)
async function generateRequestNumber() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const prefix = `PRQ-${dateStr}-`;

  const [rows] = await db.query(
    'SELECT request_number FROM inventory_requests WHERE request_number LIKE ? ORDER BY id DESC LIMIT 1',
    [`${prefix}%`]
  );

  let nextNum = 1;
  if (rows.length > 0) {
    const lastNumber = rows[0].request_number;
    const lastSeq = parseInt(lastNumber.replace(prefix, ''), 10);
    if (!isNaN(lastSeq)) {
      nextNum = lastSeq + 1;
    }
  }

  const seqStr = String(nextNum).padStart(4, '0');
  return `${prefix}${seqStr}`;
}

// GET /procurement -> index (daftar)
const index = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const employeeId = await resolveEmployeeId(req.session.userId);

    let query = 'SELECT * FROM inventory_requests WHERE created_by = ?';
    let queryParams = [employeeId];

    if (search) {
      query += ' AND title LIKE ?';
      queryParams.push(`%${search}%`);
    }

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);

    const [procurements] = await db.query(query, queryParams);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM inventory_requests WHERE created_by = ?';
    let countParams = [employeeId];

    if (search) {
      countQuery += ' AND title LIKE ?';
      countParams.push(`%${search}%`);
    }

    const [countRows] = await db.query(countQuery, countParams);
    const totalItems = countRows[0].total;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    res.render('inventory-procurement/index', {
      title: 'Permintaan Pengadaan',
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

// GET /procurement/create -> form buat
const create = async (req, res, next) => {
  try {
    res.render('inventory-procurement/create', {
      title: 'Buat Permintaan Pengadaan',
      user: req.session.username,
      error: null
    });
  } catch (error) {
    next(error);
  }
};

// POST /procurement/create -> simpan
const store = async (req, res, next) => {
  const { title, item_name, quantity, specification } = req.body;
  const employeeId = await resolveEmployeeId(req.session.userId);

  // Validation
  if (!title || title.trim() === '') {
    return res.render('inventory-procurement/create', {
      title: 'Buat Permintaan Pengadaan',
      user: req.session.username,
      error: 'Judul permohonan wajib diisi.'
    });
  }

  // Check if items exist
  const items = [];
  if (Array.isArray(item_name)) {
    for (let i = 0; i < item_name.length; i++) {
      const name = item_name[i]?.trim();
      const qty = parseInt(quantity[i]);
      const spec = Array.isArray(specification) ? (specification[i]?.trim() || '') : '';
      if (name) {
        if (isNaN(qty) || qty <= 0) {
          return res.render('inventory-procurement/create', {
            title: 'Buat Permintaan Pengadaan',
            user: req.session.username,
            error: 'Jumlah barang (quantity) harus berupa angka lebih dari 0.'
          });
        }
        items.push({ name, qty, spec });
      }
    }
  } else if (item_name && item_name.trim() !== '') {
    const qty = parseInt(quantity);
    const spec = typeof specification === 'string' ? specification.trim() : '';
    if (isNaN(qty) || qty <= 0) {
      return res.render('inventory-procurement/create', {
        title: 'Buat Permintaan Pengadaan',
        user: req.session.username,
        error: 'Jumlah barang (quantity) harus berupa angka lebih dari 0.'
      });
    }
    items.push({ name: item_name.trim(), qty, spec });
  }

  if (items.length === 0) {
    return res.render('inventory-procurement/create', {
      title: 'Buat Permintaan Pengadaan',
      user: req.session.username,
      error: 'Minimal harus menambahkan 1 barang permintaan.'
    });
  }

  // Status awal selalu pending
  const status = 'pending';
  const requestNumber = await generateRequestNumber();

  // Transaction
  try {
    await db.query('START TRANSACTION');

    const [headerResult] = await db.query(
      `INSERT INTO inventory_requests (request_number, title, status, created_by, employee_id, request_date, approved_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?, NOW(), NOW())`,
      [requestNumber, title.trim(), status, employeeId, employeeId, employeeId]
    );

    const requestId = headerResult.insertId;

    for (const item of items) {
      await db.query(
        `INSERT INTO inventory_request_details (inventory_request_id, item_name, quantity, specification, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [requestId, item.name, item.qty, item.spec]
      );
    }

    await db.query('COMMIT');
    res.redirect('/procurement');
  } catch (error) {
    await db.query('ROLLBACK');
    next(error);
  }
};

// GET /procurement/:id -> detail
const detail = async (req, res, next) => {
  const { id } = req.params;
  const employeeId = await resolveEmployeeId(req.session.userId);

  try {
    const [procurementRows] = await db.query(
      'SELECT * FROM inventory_requests WHERE id = ? AND created_by = ?',
      [id, employeeId]
    );

    if (procurementRows.length === 0) {
      return res.status(404).render('error', {
        message: 'Permintaan pengadaan tidak ditemukan atau Anda tidak memiliki akses.',
        error: { status: 404, stack: '' }
      });
    }

    const procurement = procurementRows[0];

    const [items] = await db.query(
      'SELECT * FROM inventory_request_details WHERE inventory_request_id = ?',
      [id]
    );

    res.render('inventory-procurement/detail', {
      title: `Detail ${procurement.request_number}`,
      user: req.session.username,
      procurement,
      items
    });
  } catch (error) {
    next(error);
  }
};

// POST /procurement/:id/edit -> update pending (modal)
const update = async (req, res, next) => {
  const { id } = req.params;
  const { title, item_name, quantity, specification } = req.body;
  const employeeId = await resolveEmployeeId(req.session.userId);

  try {
    const [rows] = await db.query('SELECT status FROM inventory_requests WHERE id = ? AND created_by = ?', [id, employeeId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    }

    if (rows[0].status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Hanya permintaan dengan status Pending yang dapat diubah.' });
    }

    // Validation
    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Judul permohonan wajib diisi.' });
    }

    const items = [];
    if (Array.isArray(item_name)) {
      for (let i = 0; i < item_name.length; i++) {
        const name = item_name[i]?.trim();
        const qty = parseInt(quantity[i]);
        const spec = Array.isArray(specification) ? (specification[i]?.trim() || '') : '';
        if (name) {
          if (isNaN(qty) || qty <= 0) {
            return res.status(400).json({ success: false, message: 'Jumlah barang harus lebih dari 0.' });
          }
          items.push({ name, qty, spec });
        }
      }
    } else if (item_name && item_name.trim() !== '') {
      const qty = parseInt(quantity);
      const spec = typeof specification === 'string' ? specification.trim() : '';
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: 'Jumlah barang harus lebih dari 0.' });
      }
      items.push({ name: item_name.trim(), qty, spec });
    }

    if (items.length === 0) {
      return res.status(400).json({ success: false, message: 'Minimal harus menambahkan 1 barang permintaan.' });
    }

    // Process Update
    await db.query('START TRANSACTION');

    await db.query(
      'UPDATE inventory_requests SET title = ?, updated_at = NOW() WHERE id = ?',
      [title.trim(), id]
    );

    // Remove old items
    await db.query('DELETE FROM inventory_request_details WHERE inventory_request_id = ?', [id]);

    // Insert new items
    for (const item of items) {
      await db.query(
        `INSERT INTO inventory_request_details (inventory_request_id, item_name, quantity, specification, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [id, item.name, item.qty, item.spec]
      );
    }

    await db.query('COMMIT');
    res.json({ success: true, message: 'Berhasil memperbarui permintaan.' });
  } catch (error) {
    await db.query('ROLLBACK');
    next(error);
  }
};

// POST /procurement/:id/delete -> hapus pending (modal)
const destroy = async (req, res, next) => {
  const { id } = req.params;
  const employeeId = await resolveEmployeeId(req.session.userId);

  try {
    const [rows] = await db.query('SELECT status FROM inventory_requests WHERE id = ? AND created_by = ?', [id, employeeId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    }

    if (rows[0].status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Hanya permintaan dengan status Pending yang dapat dihapus.' });
    }

    await db.query('START TRANSACTION');
    await db.query('DELETE FROM inventory_request_details WHERE inventory_request_id = ?', [id]);
    await db.query('DELETE FROM inventory_requests WHERE id = ?', [id]);
    await db.query('COMMIT');

    res.json({ success: true, message: 'Berhasil menghapus permintaan.' });
  } catch (error) {
    await db.query('ROLLBACK');
    next(error);
  }
};

// POST /procurement/:id/submit -> kirim ke Wadir
const submit = async (req, res, next) => {
  const { id } = req.params;
  const employeeId = await resolveEmployeeId(req.session.userId);

  try {
    const [rows] = await db.query('SELECT status FROM inventory_requests WHERE id = ? AND created_by = ?', [id, employeeId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    }

    if (rows[0].status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Hanya permintaan status Pending yang dapat diajukan.' });
    }

    await db.query(
      "UPDATE inventory_requests SET status = 'submitted', updated_at = NOW() WHERE id = ?",
      [id]
    );

    res.json({ success: true, message: 'Berhasil mengirim permintaan ke Wadir.' });
  } catch (error) {
    next(error);
  }
};

// GET /procurement/:id/export -> download PDF
const exportPDF = async (req, res, next) => {
  const { id } = req.params;
  const employeeId = await resolveEmployeeId(req.session.userId);

  try {
    const [procurementRows] = await db.query(
      'SELECT ir.*, e.name as requester_name FROM inventory_requests ir JOIN employees e ON ir.created_by = e.id WHERE ir.id = ? AND ir.created_by = ?',
      [id, employeeId]
    );

    if (procurementRows.length === 0) {
      return res.status(404).render('error', {
        message: 'Permintaan pengadaan tidak ditemukan.',
        error: { status: 404, stack: '' }
      });
    }

    const procurement = procurementRows[0];
    const [items] = await db.query(
      'SELECT * FROM inventory_request_details WHERE inventory_request_id = ?',
      [id]
    );

    // Initialize PDFKit
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Procurement-${procurement.request_number}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // Document Header
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('FORMULIR PERMINTAAN PENGADAAN BARANG', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .font('Helvetica')
      .text('Fakultas Teknologi Informasi - Universitas Andalas', { align: 'center' });
    doc.moveDown(1.5);

    // Horizontal line
    doc.moveTo(50, 110).lineTo(562, 110).stroke();
    doc.moveDown(1.5);

    // Info Requisition
    doc.font('Helvetica-Bold').fontSize(11).text('Informasi Permintaan:');
    doc.moveDown(0.5);

    const formattedDate = procurement.created_at ? new Date(procurement.created_at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) : '-';

    doc.font('Helvetica').fontSize(10);
    doc.text(`Nomor Permintaan : ${procurement.request_number}`);
    doc.text(`Judul Requisition  : ${procurement.title}`);
    doc.text(`Tanggal Pengajuan  : ${formattedDate}`);
    doc.text(`Pemohon            : ${procurement.requester_name}`);
    doc.text(`Status             : ${procurement.status.toUpperCase()}`);
    doc.moveDown(2);

    // Items table header
    doc.font('Helvetica-Bold').text('Daftar Barang Permintaan:');
    doc.moveDown(0.5);

    // Draw Table Header
    const tableTop = 270;
    doc.rect(50, tableTop, 512, 20).fill('#f1f5f9');
    doc.fillColor('#0f172a').font('Helvetica-Bold');
    doc.text('No.', 60, tableTop + 5, { width: 30 });
    doc.text('Nama Barang', 100, tableTop + 5, { width: 200 });
    doc.text('Spesifikasi', 310, tableTop + 5, { width: 120 });
    doc.text('Jumlah', 440, tableTop + 5, { width: 100, align: 'right' });

    let currentY = tableTop + 20;
    doc.font('Helvetica').fillColor('#334155');

    // Draw Table Items
    items.forEach((item, index) => {
      // Row borders
      doc.rect(50, currentY, 512, 20).stroke('#e2e8f0');
      doc.text(String(index + 1), 60, currentY + 5, { width: 30 });
      doc.text(item.item_name, 100, currentY + 5, { width: 200 });
      doc.text(item.specification || '-', 310, currentY + 5, { width: 120 });
      doc.text(String(item.quantity), 440, currentY + 5, { width: 100, align: 'right' });
      currentY += 20;
    });

    doc.moveDown(3);

    // Signature Area
    const sigY = doc.y + 40;
    doc.fontSize(10);
    doc.text('Pemohon,', 70, sigY);
    doc.text('Wakil Direktur Bidang Sarana & Prasarana,', 330, sigY, { width: 220, align: 'center' });

    doc.moveDown(4);
    const signNameY = doc.y + 40;
    doc.font('Helvetica-Bold').text(procurement.requester_name, 70, signNameY);
    doc.text('(..................................................)', 330, signNameY, { width: 220, align: 'center' });

    doc.end();
  } catch (error) {
    next(error);
  }
};

// GET /api/procurement -> REST API JSON
const apiList = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const employeeId = await resolveEmployeeId(req.session.userId);

    const [items] = await db.query(
      'SELECT * FROM inventory_requests WHERE created_by = ? ORDER BY id DESC LIMIT ? OFFSET ?',
      [employeeId, limit, offset]
    );

    const [countRows] = await db.query(
      'SELECT COUNT(*) as total FROM inventory_requests WHERE created_by = ?',
      [employeeId]
    );

    const totalItems = countRows[0].total;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    res.json({
      status: 'success',
      data: {
        items,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages
        }
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = {
  index,
  create,
  store,
  detail,
  update,
  destroy,
  submit,
  exportPDF,
  apiList
};
