const db = require('../lib/db');

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

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

async function collectActivities(req, limit = 0) {
  const can = (p) => Array.isArray(req.session.permissions) && req.session.permissions.includes(p);
  const isApprover = can('manage_approval');
  const isOps = can('manage_procurement') || can('manage_po') || can('manage_receiving');
  const lim = limit > 0 ? `LIMIT ${limit}` : '';

  const acts = [];
  const pushRows = (rows, mapFn) => rows.forEach((r) => { const e = mapFn(r); if (e && e.at) acts.push(e); });

  if (isApprover || isOps) {
    pushRows(await safeRows(`
      SELECT a.status, a.action_date AS at, r.request_number AS num,
             COALESCE(NULLIF(r.title, ''),
                      (SELECT item_name FROM inventory_request_details WHERE inventory_request_id = r.id ORDER BY id LIMIT 1),
                      'Permintaan Barang') AS judul
      FROM inventory_request_approvals a
      JOIN inventory_requests r ON r.id = a.inventory_request_id
      WHERE a.action_date IS NOT NULL
      ORDER BY a.action_date DESC ${lim}
    `), (r) => ({
      at: r.at,
      kind: r.status === 'rejected' ? 'rejected' : 'approved',
      title: r.judul,
      meta: `Permintaan ${r.num} ${r.status === 'rejected' ? 'ditolak' : 'disetujui'}`
    }));

    pushRows(await safeRows(`
      SELECT request_number AS num, created_at AS at,
             COALESCE(NULLIF(title, ''),
                      (SELECT item_name FROM inventory_request_details WHERE inventory_request_id = inventory_requests.id ORDER BY id LIMIT 1),
                      'Permintaan Barang') AS judul
      FROM inventory_requests ORDER BY created_at DESC ${lim}
    `), (r) => ({ at: r.at, kind: 'info', title: r.judul, meta: `Permintaan ${r.num} diajukan` }));

    pushRows(await safeRows(`
      SELECT p.purchase_number AS num, p.status, p.approved_at AS at,
             COALESCE(NULLIF(proc.title, ''), 'Pengadaan') AS judul
      FROM inventory_purchases p
      LEFT JOIN inventory_procurements proc ON proc.id = p.inventory_procurement_id
      WHERE p.approved_at IS NOT NULL
      ORDER BY p.approved_at DESC ${lim}
    `), (r) => ({
      at: r.at,
      kind: r.status === 'rejected' ? 'rejected' : 'approved',
      title: r.judul,
      meta: `PO ${r.num} ${r.status === 'rejected' ? 'ditolak' : 'disetujui'}`
    }));
  }
  if (isOps) {
    pushRows(await safeRows(`
      SELECT request_number AS num, created_at AS at,
             COALESCE(NULLIF(title, ''), 'Pengadaan') AS judul
      FROM inventory_procurements ORDER BY created_at DESC ${lim}
    `), (r) => ({ at: r.at, kind: 'info', title: r.judul, meta: `Pengadaan ${r.num} dibuat` }));

    pushRows(await safeRows(`
      SELECT p.purchase_number AS num, p.updated_at AS at,
             COALESCE(NULLIF(proc.title, ''), 'Pengadaan') AS judul
      FROM inventory_purchases p
      LEFT JOIN inventory_procurements proc ON proc.id = p.inventory_procurement_id
      WHERE p.status='completed'
      ORDER BY p.updated_at DESC ${lim}
    `), (r) => ({ at: r.at, kind: 'done', title: r.judul, meta: `Penerimaan PO ${r.num} selesai` }));
  }

  return acts
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit || acts.length)
    .map((a) => {
      const d = new Date(a.at);
      const label = Number.isNaN(d.getTime())
        ? '-'
        : `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return { kind: a.kind, title: a.title, meta: a.meta, at_label: label };
    });
}

async function collectStats(req) {
  const can = (p) => Array.isArray(req.session.permissions) && req.session.permissions.includes(p);
  const isApprover = can('manage_approval');
  const isOps = can('manage_procurement') || can('manage_po') || can('manage_receiving');


  const totalBelanja = await safeVal(`
    SELECT COALESCE(SUM(pi.price * pi.quantity), 0) AS val
    FROM inventory_purchase_items pi
    JOIN inventory_purchases p ON p.id = pi.inventory_purchase_id
    WHERE p.status IN ('approved', 'completed')
  `);

  const belanjaBulanIni = await safeVal(`
    SELECT COALESCE(SUM(pi.price * pi.quantity), 0) AS val
    FROM inventory_purchase_items pi
    JOIN inventory_purchases p ON p.id = pi.inventory_purchase_id
    WHERE p.status IN ('approved', 'completed')
      AND p.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
  `);

  const jumlahPOApproved = await safeCount(`
    SELECT COUNT(*) AS cnt FROM inventory_purchases
    WHERE status IN ('approved', 'completed')
  `);

  const rataRataPO = jumlahPOApproved > 0 ? Math.round(totalBelanja / jumlahPOApproved) : 0;


  const statusPO = { pending: 0, approved: 0, completed: 0, rejected: 0 };
  const statusRows = await safeRows(`
    SELECT status, COUNT(*) AS cnt
    FROM inventory_purchases
    GROUP BY status
  `);
  statusRows.forEach(r => {
    if (statusPO.hasOwnProperty(r.status)) statusPO[r.status] = Number(r.cnt) || 0;
  });

  const poMenungguPenerimaan = statusPO.approved;

  const totalBarangCacat = await safeVal(`
    SELECT COALESCE(SUM(received_defective), 0) AS val
    FROM inventory_purchase_items
  `);


  const totalSupplier = await safeCount(`SELECT COUNT(*) AS cnt FROM suppliers`);

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


  const statusPermintaan = { pending: 0, approved: 0, rejected: 0, fulfilled: 0 };
  const reqStatusRows = await safeRows(`
    SELECT status, COUNT(*) AS cnt
    FROM inventory_requests
    GROUP BY status
  `);
  reqStatusRows.forEach(r => {
    if (statusPermintaan.hasOwnProperty(r.status)) statusPermintaan[r.status] = Number(r.cnt) || 0;
  });
  const totalPermintaan = Object.values(statusPermintaan).reduce((a, b) => a + b, 0);


  let wakilDekanStats = null;
  if (isApprover) {
    const permintaanPending = statusPermintaan.pending;
    const poPending = statusPO.pending;

    const nominalPOPending = await safeVal(`
      SELECT COALESCE(SUM(pi.price * pi.quantity), 0) AS val
      FROM inventory_purchase_items pi
      JOIN inventory_purchases p ON p.id = pi.inventory_purchase_id
      WHERE p.status = 'pending'
    `);

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

    const permintaanMenunggu = await safeRows(`
      SELECT r.id, r.request_number, r.title, r.created_at, e.name AS pemohon_name
      FROM inventory_requests r
      LEFT JOIN employees e ON r.employee_id = e.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
      LIMIT 10
    `);

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


  const donutData = {
    labels: ['Menunggu Persetujuan', 'Disetujui', 'Selesai', 'Ditolak'],
    data: [statusPO.pending, statusPO.approved, statusPO.completed, statusPO.rejected],
    colors: ['#3b82f6', '#22c55e', '#06b6d4', '#ef4444']
  };


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


  const topBarang = await safeRows(`
    SELECT item_name AS nama, SUM(quantity) AS total_qty
    FROM inventory_request_details
    WHERE item_name IS NOT NULL AND item_name != ''
    GROUP BY item_name
    ORDER BY total_qty DESC
    LIMIT 5
  `);

  const activities = await collectActivities(req, 8);

  const totalPO = statusPO.pending + statusPO.approved + statusPO.completed + statusPO.rejected;

  return {
    isApprover,
    isOps,
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
  };
}

exports.getDashboardPage = async (req, res, next) => {
  try {
    const stats = await collectStats(req);

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.username,
      ...stats,
      fmtRp
    });
  } catch (err) {
    next(err);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const stats = await collectStats(req);
    res.json({ success: true, ...stats });
  } catch (err) {
    next(err);
  }
};

exports.getActivityPage = async (req, res, next) => {
  try {
    const PAGE_SIZE = 20;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const all = await collectActivities(req, 0); 
    const totalItems = all.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const activities = all.slice(offset, offset + PAGE_SIZE);

    const can = (p) => Array.isArray(req.session.permissions) && req.session.permissions.includes(p);
    const isApprover = can('manage_approval');
    const isOps = can('manage_procurement') || can('manage_po') || can('manage_receiving');

    res.render('dashboard/activity', {
      title: 'Riwayat Aktivitas',
      user: req.session.username,
      isApprover,
      isOps,
      activities,
      page,
      totalPages,
      totalItems
    });
  } catch (err) {
    next(err);
  }
};
