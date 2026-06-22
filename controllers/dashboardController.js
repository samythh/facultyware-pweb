/**
 * Dashboard Controller — Facultyware
 *
 * Menyediakan data statistik untuk Dasbor Admin dan Wakil Dekan.
 * Semua kueri hanya MEMBACA tabel yang sudah ada (tanpa perubahan skema).
 *
 * Tabel yang dipakai:
 *   inventory_purchases, inventory_purchase_items, inventory_request_details,
 *   inventory_transactions, suppliers, inventory_requests, inventory_procurements,
 *   inventory_request_approvals, employees, items.
 */

const db = require('../lib/db');

// ─── Helper: kueri aman (kembalikan default bila gagal/tabel tak ada) ───────
async function safeCount(sql, params = []) {
  try {
    const [rows] = await db.query(sql, params);
    return rows[0] ? Number(rows[0].cnt) || 0 : 0;
  } catch (err) {
    console.warn(`[dashboard] statistik dilewati (${err.code || err.message})`);
    return 0;
  }
}

async function safeVal(sql, params = [], field = 'val') {
  try {
    const [rows] = await db.query(sql, params);
    return rows[0] ? Number(rows[0][field]) || 0 : 0;
  } catch (err) {
    console.warn(`[dashboard] nilai dilewati (${err.code || err.message})`);
    return 0;
  }
}

async function safeRows(sql, params = []) {
  try {
    const [rows] = await db.query(sql, params);
    return rows;
  } catch (err) {
    console.warn(`[dashboard] baris dilewati (${err.code || err.message})`);
    return [];
  }
}

// ─── Nama bulan Bahasa Indonesia ───────────────────────────────────────────
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// ─── Format Rupiah ─────────────────────────────────────────────────────────
function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

// ═══════════════════════════════════════════════════════════════════════════
// REST API: GET /api/dashboard/stats
// Mengembalikan semua data statistik dalam satu respons JSON.
// ═══════════════════════════════════════════════════════════════════════════
exports.getStats = async (req, res, next) => {
  try {
    const can = (p) => Array.isArray(req.session.permissions) && req.session.permissions.includes(p);
    const isApprover = can('manage_approval');
    const isOps = can('manage_procurement') || can('manage_po') || can('manage_receiving');

    // ── 1. KPI UMUM & FINANSIAL ──────────────────────────────────────────

    // 1a. Total nilai belanja (PO approved + completed)
    const totalBelanja = await safeVal(`
      SELECT COALESCE(SUM(pi.price * pi.quantity), 0) AS val
      FROM inventory_purchase_items pi
      JOIN inventory_purchases p ON p.id = pi.inventory_purchase_id
      WHERE p.status IN ('approved', 'completed')
    `);

    // 1b. Total belanja bulan berjalan
    const belanjaBulanIni = await safeVal(`
      SELECT COALESCE(SUM(pi.price * pi.quantity), 0) AS val
      FROM inventory_purchase_items pi
      JOIN inventory_purchases p ON p.id = pi.inventory_purchase_id
      WHERE p.status IN ('approved', 'completed')
        AND p.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);

    // 1c. Jumlah PO approved+completed (untuk rata-rata)
    const jumlahPOApproved = await safeCount(`
      SELECT COUNT(*) AS cnt FROM inventory_purchases
      WHERE status IN ('approved', 'completed')
    `);

    // 1d. Rata-rata nilai per PO
    const rataRataPO = jumlahPOApproved > 0 ? Math.round(totalBelanja / jumlahPOApproved) : 0;

    // ── 2. STATISTIK STATUS PO ───────────────────────────────────────────

    const statusPO = {
      pending: 0,
      approved: 0,
      completed: 0,
      rejected: 0
    };
    const statusRows = await safeRows(`
      SELECT status, COUNT(*) AS cnt
      FROM inventory_purchases
      GROUP BY status
    `);
    statusRows.forEach(r => {
      if (statusPO.hasOwnProperty(r.status)) statusPO[r.status] = Number(r.cnt) || 0;
    });

    // 2a. PO disetujui tapi belum selesai (menunggu penerimaan)
    const poMenungguPenerimaan = statusPO.approved;

    // 2b. Akumulasi barang cacat
    const totalBarangCacat = await safeVal(`
      SELECT COALESCE(SUM(received_defective), 0) AS val
      FROM inventory_purchase_items
    `);

    // ── 3. STATISTIK SUPPLIER & PENGADAAN ────────────────────────────────

    // 3a. Total supplier terdaftar
    const totalSupplier = await safeCount(`SELECT COUNT(*) AS cnt FROM suppliers`);

    // 3b. Supplier paling aktif (5 teratas berdasarkan jumlah PO)
    const topSuppliers = await safeRows(`
      SELECT supplier AS nama, COUNT(*) AS jumlah_po,
             COALESCE(SUM(sub.total), 0) AS total_nilai
      FROM inventory_purchases p
      LEFT JOIN (
        SELECT inventory_purchase_id, SUM(price * quantity) AS total
        FROM inventory_purchase_items
        GROUP BY inventory_purchase_id
      ) sub ON sub.inventory_purchase_id = p.id
      WHERE p.supplier IS NOT NULL AND p.supplier != ''
      GROUP BY p.supplier
      ORDER BY jumlah_po DESC
      LIMIT 5
    `);

    // 3c. Pengadaan approved yang belum diproses menjadi PO
    const pengadaanBelumPO = await safeCount(`
      SELECT COUNT(*) AS cnt
      FROM inventory_procurements
      WHERE status = 'approved'
        AND id NOT IN (
          SELECT inventory_procurement_id
          FROM inventory_purchases
          WHERE inventory_procurement_id IS NOT NULL
        )
    `);

    // ── 4. STATISTIK STATUS PERMINTAAN ───────────────────────────────────

    const statusPermintaan = {
      pending: 0,
      approved: 0,
      rejected: 0,
      fulfilled: 0
    };
    const reqStatusRows = await safeRows(`
      SELECT status, COUNT(*) AS cnt
      FROM inventory_requests
      GROUP BY status
    `);
    reqStatusRows.forEach(r => {
      if (statusPermintaan.hasOwnProperty(r.status)) statusPermintaan[r.status] = Number(r.cnt) || 0;
    });
    const totalPermintaan = Object.values(statusPermintaan).reduce((a, b) => a + b, 0);

    // ── 5. STATISTIK KHUSUS ROLE ─────────────────────────────────────────

    let wakilDekanStats = null;
    if (isApprover) {
      // 5a. Jumlah permintaan pending
      const permintaanPending = statusPermintaan.pending;

      // 5b. Jumlah PO pending
      const poPending = statusPO.pending;

      // 5c. Total nominal PO pending
      const nominalPOPending = await safeVal(`
        SELECT COALESCE(SUM(pi.price * pi.quantity), 0) AS val
        FROM inventory_purchase_items pi
        JOIN inventory_purchases p ON p.id = pi.inventory_purchase_id
        WHERE p.status = 'pending'
      `);

      // 5d. Daftar PO yang menunggu persetujuan (untuk tabel ringkas)
      const daftarPOPending = await safeRows(`
        SELECT p.id, p.purchase_number, p.supplier, p.purchase_date,
               COALESCE(SUM(pi.price * pi.quantity), 0) AS total
        FROM inventory_purchases p
        LEFT JOIN inventory_purchase_items pi ON pi.inventory_purchase_id = p.id
        WHERE p.status = 'pending'
        GROUP BY p.id, p.purchase_number, p.supplier, p.purchase_date
        ORDER BY p.created_at DESC
        LIMIT 10
      `);

      // 5e. Belanja bulan ini yang disetujui vs ditolak
      const belanjaDisetujuiBulanIni = await safeVal(`
        SELECT COALESCE(SUM(pi.price * pi.quantity), 0) AS val
        FROM inventory_purchase_items pi
        JOIN inventory_purchases p ON p.id = pi.inventory_purchase_id
        WHERE p.status IN ('approved', 'completed')
          AND p.approved_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
      `);
      const belanjaDitolakBulanIni = await safeVal(`
        SELECT COALESCE(SUM(pi.price * pi.quantity), 0) AS val
        FROM inventory_purchase_items pi
        JOIN inventory_purchases p ON p.id = pi.inventory_purchase_id
        WHERE p.status = 'rejected'
          AND p.approved_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
      `);

      wakilDekanStats = {
        permintaanPending,
        poPending,
        totalAntrean: permintaanPending + poPending,
        nominalPOPending,
        nominalPOPending_label: fmtRp(nominalPOPending),
        daftarPOPending,
        belanjaDisetujuiBulanIni,
        belanjaDisetujuiBulanIni_label: fmtRp(belanjaDisetujuiBulanIni),
        belanjaDitolakBulanIni,
        belanjaDitolakBulanIni_label: fmtRp(belanjaDitolakBulanIni)
      };
    }

    let adminStats = null;
    if (isOps) {
      // 5f. PO yang memerlukan tindak lanjut (approved tapi belum completed)
      const poPerluTindakan = await safeRows(`
        SELECT p.id, p.purchase_number, p.supplier, p.purchase_date, p.status,
               COALESCE(SUM(pi.price * pi.quantity), 0) AS total
        FROM inventory_purchases p
        LEFT JOIN inventory_purchase_items pi ON pi.inventory_purchase_id = p.id
        WHERE p.status = 'approved'
        GROUP BY p.id, p.purchase_number, p.supplier, p.purchase_date, p.status
        ORDER BY p.created_at ASC
        LIMIT 10
      `);

      // 5g. Permintaan yang menunggu persetujuan
      const permintaanMenunggu = await safeRows(`
        SELECT r.id, r.request_number, r.title, r.created_at, e.name AS pemohon_name
        FROM inventory_requests r
        LEFT JOIN employees e ON r.employee_id = e.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC
        LIMIT 10
      `);

      // 5h. PO pending (menunggu persetujuan Wadir)
      const poMenungguPersetujuan = await safeRows(`
        SELECT p.id, p.purchase_number, p.supplier,
               COALESCE(SUM(pi.price * pi.quantity), 0) AS total
        FROM inventory_purchases p
        LEFT JOIN inventory_purchase_items pi ON pi.inventory_purchase_id = p.id
        WHERE p.status = 'pending'
        GROUP BY p.id, p.purchase_number, p.supplier
        ORDER BY p.created_at DESC
        LIMIT 10
      `);

      adminStats = {
        poPerluTindakan,
        permintaanMenunggu,
        poMenungguPersetujuan,
        pengadaanBelumPO
      };
    }

    // ── 6. DATA VISUALISASI GRAFIK ───────────────────────────────────────

    // 6a. Donut/Pie chart — distribusi status PO
    const donutData = {
      labels: ['Menunggu Persetujuan', 'Disetujui', 'Selesai', 'Ditolak'],
      data: [statusPO.pending, statusPO.approved, statusPO.completed, statusPO.rejected],
      colors: ['#3b82f6', '#22c55e', '#06b6d4', '#ef4444']
    };

    // 6b. Line chart — tren nilai belanja per bulan (6 bulan terakhir)
    const trendLabels = [];
    const trendData = [];
    try {
      const [rows] = await db.query(`
        SELECT DATE_FORMAT(p.created_at, '%Y-%m') AS ym,
               COALESCE(SUM(pi.price * pi.quantity), 0) AS total
        FROM inventory_purchases p
        JOIN inventory_purchase_items pi ON pi.inventory_purchase_id = p.id
        WHERE p.status IN ('approved', 'completed')
          AND p.created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 5 MONTH)
        GROUP BY ym
      `);
      const counts = {};
      rows.forEach(r => { counts[r.ym] = Number(r.total) || 0; });
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        trendLabels.push(BULAN[d.getMonth()]);
        trendData.push(counts[ym] || 0);
      }
    } catch (err) {
      console.warn(`[dashboard] tren dilewati (${err.code || err.message})`);
    }

    // 6c. 5 barang paling banyak diminta
    const topBarang = await safeRows(`
      SELECT item_name AS nama, SUM(quantity) AS total_qty
      FROM inventory_request_details
      WHERE item_name IS NOT NULL AND item_name != ''
      GROUP BY item_name
      ORDER BY total_qty DESC
      LIMIT 5
    `);

    // ── 7. AKTIVITAS TERBARU ─────────────────────────────────────────────
    const acts = [];
    const pushRows = (rows, mapFn) => rows.forEach((r) => { const e = mapFn(r); if (e && e.at) acts.push(e); });

    if (isApprover || isOps) {
      pushRows(await safeRows(`
        SELECT a.status, a.action_date AS at, r.request_number AS num
        FROM inventory_request_approvals a
        JOIN inventory_requests r ON r.id = a.inventory_request_id
        WHERE a.action_date IS NOT NULL
        ORDER BY a.action_date DESC LIMIT 8
      `), (r) => ({
        at: r.at,
        kind: r.status === 'rejected' ? 'rejected' : 'approved',
        text: r.status === 'rejected' ? `Permintaan ${r.num} ditolak` : `Permintaan ${r.num} disetujui`
      }));

      pushRows(await safeRows(`
        SELECT request_number AS num, created_at AS at
        FROM inventory_requests ORDER BY created_at DESC LIMIT 8
      `), (r) => ({ at: r.at, kind: 'info', text: `Permintaan ${r.num} diajukan` }));

      pushRows(await safeRows(`
        SELECT purchase_number AS num, status, approved_at AS at
        FROM inventory_purchases
        WHERE approved_at IS NOT NULL
        ORDER BY approved_at DESC LIMIT 8
      `), (r) => ({
        at: r.at,
        kind: r.status === 'rejected' ? 'rejected' : 'approved',
        text: r.status === 'rejected' ? `PO ${r.num} ditolak` : `PO ${r.num} disetujui`
      }));
    }
    if (isOps) {
      pushRows(await safeRows(`
        SELECT request_number AS num, created_at AS at
        FROM inventory_procurements ORDER BY created_at DESC LIMIT 8
      `), (r) => ({ at: r.at, kind: 'info', text: `Pengadaan ${r.num} dibuat` }));

      pushRows(await safeRows(`
        SELECT purchase_number AS num, updated_at AS at
        FROM inventory_purchases WHERE status='completed'
        ORDER BY updated_at DESC LIMIT 8
      `), (r) => ({ at: r.at, kind: 'done', text: `Penerimaan PO ${r.num} selesai` }));
    }

    const activities = acts
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8)
      .map((a) => {
        const d = new Date(a.at);
        const label = Number.isNaN(d.getTime())
          ? '-'
          : `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return { kind: a.kind, text: a.text, at_label: label };
      });

    // ── 8. JUMLAH TOTAL PO ───────────────────────────────────────────────
    const totalPO = statusPO.pending + statusPO.approved + statusPO.completed + statusPO.rejected;

    // ── RESPONS JSON ─────────────────────────────────────────────────────
    res.json({
      success: true,
      role: { isApprover, isOps },
      kpiUmum: {
        totalBelanja,
        totalBelanja_label: fmtRp(totalBelanja),
        belanjaBulanIni,
        belanjaBulanIni_label: fmtRp(belanjaBulanIni),
        rataRataPO,
        rataRataPO_label: fmtRp(rataRataPO)
      },
      statusPO,
      totalPO,
      poMenungguPenerimaan,
      totalBarangCacat,
      totalSupplier,
      topSuppliers,
      pengadaanBelumPO,
      statusPermintaan,
      totalPermintaan,
      wakilDekanStats,
      adminStats,
      chart: {
        donut: donutData,
        trendLabels,
        trendData,
        topBarang
      },
      activities
    });
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGE RENDER: GET /dashboard
// Render halaman dashboard dengan data minimal (role flags).
// Data statistik dimuat via AJAX ke /api/dashboard/stats.
// ═══════════════════════════════════════════════════════════════════════════
exports.getDashboardPage = async (req, res, next) => {
  try {
    const can = (p) => Array.isArray(req.session.permissions) && req.session.permissions.includes(p);
    const isApprover = can('manage_approval');
    const isOps = can('manage_procurement') || can('manage_po') || can('manage_receiving');

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.username,
      isApprover,
      isOps
    });
  } catch (err) {
    next(err);
  }
};
