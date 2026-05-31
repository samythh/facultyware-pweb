// Controller Modul Penerimaan Barang (Penerimaan / Receiving)
// Oleh: Mikail (2411523016) - Kelompok B09
//
// Aturan:
// - Native mysql2 (TANPA ORM). pool sudah berupa pool.promise() dari lib/db.js.
// - Selalu pakai prepared statement: pool.query(sql, [params]).
// - JANGAN membuat tabel baru. Tabel yang dipakai:
//   inventory_purchases, inventory_purchase_items, inventory_transactions,
//   inventories, items.

const pool = require("../lib/db");
const PDFDocument = require("pdfkit");

const PAGE_SIZE = 10;

// Label status PO (enum DB: 'draft' | 'completed') ke bahasa tampilan.
const STATUS_LABEL = {
  draft: "Draf",
  completed: "Selesai",
};

// Format tanggal (DATE) ke dd-mm-yyyy berdasarkan waktu lokal (hindari geser UTC).
function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// Format angka ke Rupiah (mis. 55000 -> "Rp 55.000").
function fmtRp(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

// Bangun klausa pencarian opsional (purchase_number / supplier).
function buildSearch(q) {
  const term = (q || "").trim();
  if (!term) return { where: "", params: [] };
  return {
    where: "WHERE purchase_number LIKE ? OR supplier LIKE ?",
    params: [`%${term}%`, `%${term}%`],
  };
}

/**
 * GET /receiving
 * Daftar penerimaan barang (list PO) + pencarian + pagination.
 */
const index = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;
    const search = (req.query.q || "").trim();
    const { where, params } = buildSearch(search);

    const [rows] = await pool.query(
      `SELECT id, purchase_number, supplier, purchase_date, status
       FROM inventory_purchases
       ${where}
       ORDER BY purchase_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_purchases ${where}`,
      params
    );

    const data = rows.map((r) => ({
      ...r,
      purchase_date: fmtDate(r.purchase_date),
      status_label: STATUS_LABEL[r.status] || r.status,
    }));

    res.render("receiving/index", {
      title: "Penerimaan Barang",
      user: req.session.username,
      rows: data,
      search,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /receiving/:po_id/verify
 * Form verifikasi kecocokan fisik barang dengan dokumen PO.
 */
const verifyForm = async (req, res, next) => {
  try {
    const poId = req.params.po_id;

    const [poRows] = await pool.query(
      `SELECT id, purchase_number, supplier, purchase_date, status
       FROM inventory_purchases WHERE id = ?`,
      [poId]
    );
    const po = poRows[0]
      ? {
          ...poRows[0],
          purchase_date: fmtDate(poRows[0].purchase_date),
          status_label: STATUS_LABEL[poRows[0].status] || poRows[0].status,
        }
      : null;

    const [items] = await pool.query(
      `SELECT ipi.id, ipi.quantity, ipi.price, it.name, it.code, it.unit
       FROM inventory_purchase_items ipi
       JOIN items it ON it.id = ipi.item_id
       WHERE ipi.inventory_purchase_id = ?
       ORDER BY ipi.id`,
      [poId]
    );

    let totalValue = 0;
    items.forEach((i) => {
      totalValue += (Number(i.price) || 0) * Number(i.quantity);
    });
    const summary = {
      itemCount: items.length,
      totalValue_label: fmtRp(totalValue),
    };

    res.render("receiving/verify", {
      title: "Verifikasi Penerimaan",
      user: req.session.username,
      po,
      items,
      summary,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /receiving/:po_id/verify
 * Simpan hasil verifikasi (qty diterima, kondisi, keterangan) + upload bukti.
 * Pakai middleware upload (req.file tersedia di sini).
 */
const verifyStore = async (req, res, next) => {
  try {
    // TODO: validasi input, simpan qty diterima & kondisi per item,
    //       simpan path bukti (req.file?.filename), update status PO.
    res.send("TODO: verifyStore");
  } catch (err) {
    next(err);
  }
};

/**
 * POST /receiving/:po_id/confirm
 * Konfirmasi penerimaan final -> auto-update stok.
 */
const confirm = async (req, res, next) => {
  const id = req.params.po_id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Kunci baris PO selama transaksi.
    const [poRows] = await conn.query(
      "SELECT id, purchase_number, status FROM inventory_purchases WHERE id = ? FOR UPDATE",
      [id]
    );
    if (poRows.length === 0) {
      await conn.rollback();
      return res.status(404).render("error", {
        message: "Purchase order tidak ditemukan.",
        error: { status: 404, stack: "" },
      });
    }
    const po = poRows[0];

    // Idempoten: kalau sudah 'completed', jangan tambah stok dua kali.
    if (po.status === "completed") {
      await conn.rollback();
      return res.redirect(`/receiving/${id}/detail`);
    }

    const [items] = await conn.query(
      "SELECT item_id, quantity FROM inventory_purchase_items WHERE inventory_purchase_id = ?",
      [id]
    );

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    for (const it of items) {
      // 1) Catat transaksi barang masuk (type='in'), referensi = No PO.
      await conn.query(
        `INSERT INTO inventory_transactions
           (item_id, type, quantity, transaction_date, reference, notes, created_at, updated_at)
         VALUES (?, 'in', ?, ?, ?, 'Penerimaan barang dikonfirmasi', NOW(), NOW())`,
        [it.item_id, it.quantity, today, po.purchase_number]
      );

      // 2) Tambah stok: update kalau baris stok ada, kalau tidak buat baru.
      const [inv] = await conn.query(
        "SELECT id FROM inventories WHERE item_id = ? LIMIT 1",
        [it.item_id]
      );
      if (inv.length > 0) {
        await conn.query(
          "UPDATE inventories SET quantity = quantity + ?, updated_at = NOW() WHERE item_id = ?",
          [it.quantity, it.item_id]
        );
      } else {
        await conn.query(
          "INSERT INTO inventories (item_id, quantity, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
          [it.item_id, it.quantity]
        );
      }
    }

    // 3) Tandai PO selesai.
    await conn.query(
      "UPDATE inventory_purchases SET status = 'completed', updated_at = NOW() WHERE id = ?",
      [id]
    );

    await conn.commit();
    res.redirect(`/receiving/${id}/detail`);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

/**
 * POST /receiving/retur
 * Catat retur barang ke vendor.
 */
const retur = async (req, res, next) => {
  const poId = req.body.po_id;
  const itemId = req.body.item_id;
  const qty = parseInt(req.body.quantity, 10);
  const reason = (req.body.notes || "").trim();

  // Validasi dasar.
  if (!poId || !itemId || !Number.isInteger(qty) || qty <= 0) {
    return res.status(400).render("error", {
      message: "Data retur tidak valid (item & jumlah wajib diisi).",
      error: { status: 400, stack: "" },
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [poRows] = await conn.query(
      "SELECT purchase_number FROM inventory_purchases WHERE id = ?",
      [poId]
    );
    if (poRows.length === 0) {
      await conn.rollback();
      return res.status(404).render("error", {
        message: "Purchase order tidak ditemukan.",
        error: { status: 404, stack: "" },
      });
    }
    const purchaseNumber = poRows[0].purchase_number;

    // Catat transaksi keluar (retur ke vendor).
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const notes = reason ? `Retur ke vendor: ${reason}` : "Retur ke vendor";

    await conn.query(
      `INSERT INTO inventory_transactions
         (item_id, type, quantity, transaction_date, reference, notes, created_at, updated_at)
       VALUES (?, 'out', ?, ?, ?, ?, NOW(), NOW())`,
      [itemId, qty, today, purchaseNumber, notes]
    );

    // Kurangi stok (jaga agar tidak negatif).
    await conn.query(
      "UPDATE inventories SET quantity = GREATEST(quantity - ?, 0), updated_at = NOW() WHERE item_id = ?",
      [qty, itemId]
    );

    await conn.commit();
    res.redirect(`/receiving/${poId}/detail`);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

/**
 * GET /receiving/:id/detail
 * Detail penerimaan: PO + qty dipesan vs qty diterima.
 */
const detail = async (req, res, next) => {
  try {
    const id = req.params.id;

    const [poRows] = await pool.query(
      `SELECT id, purchase_number, supplier, purchase_date, status
       FROM inventory_purchases WHERE id = ?`,
      [id]
    );
    const po = poRows[0]
      ? {
          ...poRows[0],
          purchase_date: fmtDate(poRows[0].purchase_date),
          status_label: STATUS_LABEL[poRows[0].status] || poRows[0].status,
        }
      : null;

    // Qty diterima dihitung dari transaksi masuk (type='in') yang mereferensikan No PO.
    const [items] = await pool.query(
      `SELECT ipi.id, it.id AS item_id, it.name, it.unit,
              ipi.quantity AS ordered_qty,
              ipi.price,
              COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.quantity END), 0) AS received_qty
       FROM inventory_purchase_items ipi
       JOIN items it ON it.id = ipi.item_id
       JOIN inventory_purchases p ON p.id = ipi.inventory_purchase_id
       LEFT JOIN inventory_transactions t
              ON t.item_id = ipi.item_id
             AND t.reference = p.purchase_number
             AND t.type = 'in'
       WHERE ipi.inventory_purchase_id = ?
       GROUP BY ipi.id, it.id, it.name, it.unit, ipi.quantity, ipi.price
       ORDER BY ipi.id`,
      [id]
    );

    let totalOrdered = 0;
    let totalReceived = 0;
    let totalValue = 0;
    items.forEach((i) => {
      i.ordered_qty = Number(i.ordered_qty);
      i.received_qty = Number(i.received_qty);
      i.price = Number(i.price) || 0;
      i.line_total = i.price * i.ordered_qty;
      i.diff = i.received_qty - i.ordered_qty;
      i.price_label = fmtRp(i.price);
      i.line_total_label = fmtRp(i.line_total);
      totalOrdered += i.ordered_qty;
      totalReceived += i.received_qty;
      totalValue += i.line_total;
    });

    const summary = {
      itemCount: items.length,
      totalOrdered,
      totalReceived,
      totalValue,
      totalValue_label: fmtRp(totalValue),
    };

    // Riwayat retur (transaksi keluar 'out' yang mereferensikan No PO ini).
    let returns = [];
    if (po) {
      const [rows] = await pool.query(
        `SELECT t.quantity, t.transaction_date, t.notes, it.name, it.unit
         FROM inventory_transactions t
         JOIN items it ON it.id = t.item_id
         WHERE t.reference = ? AND t.type = 'out'
         ORDER BY t.id DESC`,
        [po.purchase_number]
      );
      returns = rows.map((r) => ({
        ...r,
        transaction_date: fmtDate(r.transaction_date),
      }));
    }

    res.render("receiving/detail", {
      title: "Detail Penerimaan",
      user: req.session.username,
      po,
      items,
      summary,
      returns,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /receiving/:id/export
 * Generate Laporan Penerimaan Barang (PDF) dengan pdfkit.
 */
const exportPDF = async (req, res, next) => {
  try {
    const id = req.params.id;

    const [poRows] = await pool.query(
      `SELECT id, purchase_number, supplier, purchase_date, status
       FROM inventory_purchases WHERE id = ?`,
      [id]
    );
    if (poRows.length === 0) {
      return res.status(404).render("error", {
        message: "Purchase order tidak ditemukan.",
        error: { status: 404, stack: "" },
      });
    }
    const po = poRows[0];

    const [items] = await pool.query(
      `SELECT it.name, it.unit,
              ipi.quantity AS ordered_qty,
              ipi.price,
              COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.quantity END), 0) AS received_qty
       FROM inventory_purchase_items ipi
       JOIN items it ON it.id = ipi.item_id
       JOIN inventory_purchases p ON p.id = ipi.inventory_purchase_id
       LEFT JOIN inventory_transactions t
              ON t.item_id = ipi.item_id
             AND t.reference = p.purchase_number
             AND t.type = 'in'
       WHERE ipi.inventory_purchase_id = ?
       GROUP BY ipi.id, it.name, it.unit, ipi.quantity, ipi.price
       ORDER BY ipi.id`,
      [id]
    );

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Laporan-Penerimaan-${po.purchase_number}.pdf"`
    );
    doc.pipe(res);

    // Judul
    doc.font("Helvetica-Bold").fontSize(16).text("Laporan Penerimaan Barang", { align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor("#666")
      .text("FacultyWare - Sistem Informasi Pengadaan Barang Fakultas", { align: "center" });
    doc.fillColor("#000").moveDown(1.2);

    // Info PO
    const infoY = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").text("No PO", 50, infoY);
    doc.font("Helvetica").text(`: ${po.purchase_number}`, 140, infoY);
    doc.font("Helvetica-Bold").text("Pemasok", 50, infoY + 16);
    doc.font("Helvetica").text(`: ${po.supplier || "-"}`, 140, infoY + 16);
    doc.font("Helvetica-Bold").text("Tanggal", 50, infoY + 32);
    doc.font("Helvetica").text(`: ${fmtDate(po.purchase_date)}`, 140, infoY + 32);
    doc.font("Helvetica-Bold").text("Status", 50, infoY + 48);
    doc.font("Helvetica").text(`: ${STATUS_LABEL[po.status] || po.status}`, 140, infoY + 48);
    doc.moveDown(4);

    // Tabel
    const colX = { no: 50, name: 80, ordered: 285, received: 350, price: 415, subtotal: 490 };
    const drawRow = (y, c, opts = {}) => {
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      doc.text(c.no, colX.no, y, { width: 25 });
      doc.text(c.name, colX.name, y, { width: 200 });
      doc.text(c.ordered, colX.ordered, y, { width: 55, align: "right" });
      doc.text(c.received, colX.received, y, { width: 55, align: "right" });
      doc.text(c.price, colX.price, y, { width: 65, align: "right" });
      doc.text(c.subtotal, colX.subtotal, y, { width: 65, align: "right" });
    };

    let y = doc.y;
    drawRow(y, { no: "No", name: "Nama Barang", ordered: "Dipesan", received: "Diterima", price: "Harga", subtotal: "Subtotal" }, { bold: true });
    y += 14;
    doc.moveTo(50, y).lineTo(555, y).strokeColor("#cccccc").stroke();
    y += 6;

    let totalValue = 0;
    items.forEach((it, idx) => {
      const ordered = Number(it.ordered_qty);
      const received = Number(it.received_qty);
      const price = Number(it.price) || 0;
      const subtotal = price * ordered;
      totalValue += subtotal;

      if (y > 760) {
        doc.addPage();
        y = 50;
      }
      drawRow(y, {
        no: String(idx + 1),
        name: `${it.name} (${it.unit})`,
        ordered: String(ordered),
        received: String(received),
        price: fmtRp(price),
        subtotal: fmtRp(subtotal),
      });
      y += 16;
    });

    y += 4;
    doc.moveTo(50, y).lineTo(555, y).strokeColor("#cccccc").stroke();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Total Nilai PO", colX.name, y, { width: 200 });
    doc.text(fmtRp(totalValue), colX.price, y, { width: 130, align: "right" });

    // Tanda tangan / footer
    doc.font("Helvetica").fontSize(9).fillColor("#666")
      .text(`Dicetak: ${fmtDate(new Date())}`, 50, 790, { align: "left" });

    doc.end();
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/receiving
 * REST API list penerimaan barang (JSON) dengan pagination.
 */
const apiList = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE));
    const offset = (page - 1) * limit;
    const { where, params } = buildSearch(req.query.q);

    const [rows] = await pool.query(
      `SELECT id, purchase_number, supplier, purchase_date, status
       FROM inventory_purchases
       ${where}
       ORDER BY purchase_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_purchases ${where}`,
      params
    );

    const data = rows.map((r) => {
      const d = r.purchase_date ? new Date(r.purchase_date) : null;
      const iso = d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : null;
      return { ...r, purchase_date: iso };
    });

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  index,
  verifyForm,
  verifyStore,
  confirm,
  retur,
  detail,
  exportPDF,
  apiList,
};
