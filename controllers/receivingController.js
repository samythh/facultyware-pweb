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
  try {
    // TODO: dalam transaksi:
    //   1) set status inventory_purchases = 'completed'
    //   2) insert inventory_transactions (type='in') per item
    //   3) update/insert inventories.quantity
    res.send("TODO: confirm");
  } catch (err) {
    next(err);
  }
};

/**
 * POST /receiving/retur
 * Catat retur barang ke vendor.
 */
const retur = async (req, res, next) => {
  try {
    // TODO: insert inventory_transactions (type='out'/'adjustment') sebagai retur,
    //       sesuaikan inventories.quantity, catat alasan di notes.
    res.send("TODO: retur");
  } catch (err) {
    next(err);
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
      `SELECT ipi.id, it.name, it.unit,
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

    res.render("receiving/detail", {
      title: "Detail Penerimaan",
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
 * GET /receiving/:id/export
 * Generate Laporan Penerimaan Barang (PDF) dengan pdfkit.
 */
const exportPDF = async (req, res, next) => {
  try {
    // TODO: ambil data, buat PDFDocument, pipe ke res dengan
    //       Content-Type: application/pdf + Content-Disposition attachment.
    res.send("TODO: exportPDF");
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
