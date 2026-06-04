const db = require('../lib/db');       // Utility koneksi database
const PDFDocument = require('pdfkit'); // Library untuk generate PDF

// Daftar PO
exports.index = async (req, res, next) => {
  try {
    const { page = 1, search = '' } = req.query;
    const limit = 10;
    const offset = (page - 1) * limit;

    const [purchases] = await db.query(
      `SELECT * FROM inventory_purchases 
       WHERE supplier LIKE ? OR purchase_number LIKE ?
       LIMIT ? OFFSET ?`,
      [`%${search}%`, `%${search}%`, limit, offset]
    );

    res.render('purchase/index', { title: 'Daftar Purchase Order', user: req.session.username, purchases, search, page });
  } catch (err) { next(err); }
};

// Form Create PO
exports.create = async (req, res, next) => {
  try {
    const [procurements] = await db.query(
      `SELECT * FROM inventory_procurements 
       WHERE status='approved' 
       AND id NOT IN (SELECT inventory_procurement_id FROM inventory_purchases WHERE inventory_procurement_id IS NOT NULL)`
    );
    res.render('purchase/create', { title: 'Buat Purchase Order', user: req.session.username, procurements, error: null });
  } catch (err) { next(err); }
};

// Simpan PO Baru
exports.store = async (req, res, next) => {
  try {
    const { purchase_date, supplier, inventory_procurement_id } = req.body;
    const rawPrices = req.body.prices || req.body['prices[]'];
    const pricesArray = Array.isArray(rawPrices) ? rawPrices : (rawPrices ? [rawPrices] : []);

    if (!purchase_date || !supplier || !inventory_procurement_id) {
      const [procurements] = await db.query(
        `SELECT * FROM inventory_procurements 
         WHERE status='approved' 
         AND id NOT IN (SELECT inventory_procurement_id FROM inventory_purchases WHERE inventory_procurement_id IS NOT NULL)`
      );
      return res.render('purchase/create', { title: 'Buat Purchase Order', user: req.session.username, procurements, error: 'Field wajib diisi!' });
    }

    const [dupRows] = await db.query(
      `SELECT COUNT(*) as cnt FROM inventory_purchases WHERE inventory_procurement_id=?`,
      [inventory_procurement_id]
    );
    if (dupRows[0].cnt > 0) {
      const [procurements] = await db.query(
        `SELECT * FROM inventory_procurements 
         WHERE status='approved' 
         AND id NOT IN (SELECT inventory_procurement_id FROM inventory_purchases WHERE inventory_procurement_id IS NOT NULL)`
      );
      return res.render('purchase/create', { title: 'Buat Purchase Order', user: req.session.username, procurements, error: 'PO sudah ada untuk permintaan ini!' });
    }

    const now = new Date(purchase_date || Date.now());
    const prefix = `PO-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
    const [countRows] = await db.query(`SELECT COUNT(*) as cnt FROM inventory_purchases`);
    const purchase_number = `${prefix}-${String(countRows[0].cnt+1).padStart(4,'0')}`;

    const [result] = await db.query(
      `INSERT INTO inventory_purchases (purchase_number, inventory_procurement_id, purchase_date, supplier, status)
       VALUES (?,?,?,?,?)`,
      [purchase_number, inventory_procurement_id, purchase_date, supplier, 'draft']
    );

    const [items] = await db.query(
      `SELECT * FROM inventory_procurement_items WHERE inventory_procurement_id=? ORDER BY id ASC`,
      [inventory_procurement_id]
    );

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const price = parseFloat(pricesArray[i]) || 0;
      await db.query(
        `INSERT INTO inventory_purchase_items (inventory_purchase_id, item_id, quantity, price)
         VALUES (?,?,?,?)`,
        [result.insertId, item.item_id, item.quantity, price]
      );
    }

    res.redirect('/purchase');
  } catch (err) { next(err); }
};

// Detail PO
exports.detail = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [poRows] = await db.query(`SELECT * FROM inventory_purchases WHERE id=?`, [id]);
    if (!poRows || poRows.length === 0) return res.status(404).send('PO not found');
    const po = poRows[0];

    const [items] = await db.query(
      `SELECT i.name, pi.quantity, pi.price, (pi.quantity*pi.price) as subtotal
       FROM inventory_purchase_items pi
       JOIN items i ON pi.item_id=i.id
       WHERE pi.inventory_purchase_id=?`,
      [id]
    );

    const total = items.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);

    res.render('purchase/detail', { title: 'Detail Purchase Order', user: req.session.username, po, items, total });
  } catch (err) { next(err); }
};

// Update Status PO
exports.updateStatus = async (req, res, next) => {
  try {
    const id = req.params.id;
    await db.query(`UPDATE inventory_purchases SET status='completed' WHERE id=?`, [id]);
    res.redirect(`/purchase/${id}`);
  } catch (err) { next(err); }
};

// Export PDF: formulir Purchase Order
exports.exportPDF = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [poRows] = await db.query(`SELECT * FROM inventory_purchases WHERE id=?`, [id]);
    if (!poRows || poRows.length === 0) {
      return res.status(404).send('PO not found');
    }
    const po = poRows[0];

    const [items] = await db.query(
      `SELECT i.name, pi.quantity, pi.price, (pi.quantity*pi.price) as subtotal
       FROM inventory_purchase_items pi
       JOIN items i ON pi.item_id=i.id
       WHERE pi.inventory_purchase_id=?`,
      [id]
    );

    const total = items.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=po-${po.purchase_number}.pdf`);
    doc.pipe(res);

    // Header institusi
    doc.fontSize(14).font("Helvetica-Bold")
       .text("Fakultas Teknologi Informasi - Universitas Andalas", { align: "center" });
    doc.moveDown(0.5);

    // Judul dokumen
    doc.fontSize(18).font("Helvetica-Bold")
       .text("FORMULIR PURCHASE ORDER", { align: "center" });
    doc.moveDown();

    // Informasi PO
    doc.fontSize(12).font("Helvetica")
       .text(`Nomor PO   : ${po.purchase_number}`)
       .text(`Tanggal    : ${po.purchase_date}`)
       .text(`Supplier   : ${po.supplier}`)
       .text(`Status     : ${po.status}`);
    doc.moveDown();

    // Tabel barang
    const tableTop = doc.y + 10;
    const startX = 50;
    const colWidths = [40, 200, 80, 100, 100]; // No, Item, Qty, Harga, Subtotal

    // Header tabel
    const headers = ["No", "Item", "Qty", "Harga", "Subtotal"];
    let x = startX;
    headers.forEach((h, i) => {
      doc.rect(x, tableTop, colWidths[i], 20).stroke();
      doc.font("Helvetica-Bold")
         .text(h, x + 5, tableTop + 5, { width: colWidths[i] - 10, align: "center" });
      x += colWidths[i];
    });

    // Isi tabel
    let y = tableTop + 20;
    items.forEach((it, idx) => {
      x = startX;
      const row = [
        idx + 1,
        it.name,
        it.quantity,
        Number(it.price).toLocaleString('id-ID', { minimumFractionDigits: 2 }),
        Number(it.subtotal).toLocaleString('id-ID', { minimumFractionDigits: 2 })
      ];
      row.forEach((val, i) => {
        doc.rect(x, y, colWidths[i], 20).stroke();
        doc.font("Helvetica")
           .text(val.toString(), x + 5, y + 5, { width: colWidths[i] - 10, align: "center" });
        x += colWidths[i];
      });
      y += 20;
    });

    // Baris total
    const totalLabelWidth = colWidths.slice(0, 4).reduce((a, b) => a + b, 0);
    doc.rect(startX, y, totalLabelWidth, 20).stroke();
    doc.font("Helvetica-Bold")
       .text("Total", startX + 5, y + 5, { width: totalLabelWidth - 10, align: "right" });
    doc.rect(startX + totalLabelWidth, y, colWidths[4], 20).stroke();
    doc.text(
      Number(total).toLocaleString('id-ID', { minimumFractionDigits: 2 }),
      startX + totalLabelWidth + 5,
      y + 5,
      { width: colWidths[4] - 10, align: "center" }
    );

    // Footer tanda tangan
    doc.moveDown(3);
    doc.fontSize(12).text("Disiapkan oleh,", startX, doc.y);
    doc.text("Disetujui,", startX + 300, doc.y);

    doc.end();
  } catch (err) {
    next(err);
  }
};

// API JSON
exports.apiList = async (req, res, next) => {
  try {
    const { page = 1 } = req.query;
    const limit = 10;
    const offset = (page - 1) * limit;

    const [purchases] = await db.query(
      `SELECT * FROM inventory_purchases LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [countRows] = await db.query(`SELECT COUNT(*) as cnt FROM inventory_purchases`);
    const total = countRows[0].cnt;
    const totalPages = Math.ceil(total / limit);

    res.json({
      purchases,
      pagination: {
        page: Number(page),
        limit,
        total,
        totalPages
      }
    });
  } catch (err) { next(err); }
};

// Ambil item dari procurement
exports.procurementItems = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [items] = await db.query(
      `SELECT pi.item_id, COALESCE(pi.item_name, i.name) as name, pi.quantity
       FROM inventory_procurement_items pi
       LEFT JOIN items i ON pi.item_id = i.id
       WHERE pi.inventory_procurement_id = ?
       ORDER BY pi.id ASC`,
      [id]
    );
    res.json({ items });
  } catch (err) { next(err); }
};

// Dashboard Statistik
// Tiap statistik dibungkus sendiri-sendiri supaya tabel/kolom yang belum pasti
// ada di DB (mis. kolom `supplier`) tidak membuat seluruh dashboard error.
// Nilai gagal -> fallback 0. TODO: kunci skema final setelah konfirmasi dosen.
async function safeCount(sql, params = []) {
  try {
    const [rows] = await db.query(sql, params);
    return rows[0] ? Number(rows[0].cnt) || 0 : 0;
  } catch (err) {
    console.warn(`[dashboard] statistik dilewati (${err.code || err.message}): ${sql}`);
    return 0;
  }
}

exports.dashboard = async (req, res, next) => {
  try {
    const totalReq = await safeCount(`SELECT COUNT(*) as cnt FROM inventory_procurements`);
    const pending = await safeCount(`SELECT COUNT(*) as cnt FROM inventory_procurements WHERE status='submitted'`);
    const totalPO = await safeCount(`SELECT COUNT(*) as cnt FROM inventory_purchases`);
    // Kolom `supplier` belum pasti ada di skema final -> safeCount akan fallback 0 bila tidak ada.
    const supplier = await safeCount(`SELECT COUNT(DISTINCT supplier) as cnt FROM inventory_purchases`);

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.username,
      totalReq,
      pending,
      totalPO,
      supplier
    });
  } catch (err) { next(err); }
};
