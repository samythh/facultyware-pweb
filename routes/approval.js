const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { checkPermission } = require('../middlewares/acl');

// Menerapkan middleware untuk semua route di bawah ini
router.use(checkPermission('manage_approval'));

// 1. Redirect kalau user cuma ngetik /approval
router.get('/', (req, res) => {
    res.redirect('/approval/inbox');
});

// Fungsi bantuan untuk menghitung statistik Dashboard Wadir
async function getStats() {
    const query = `
        SELECT 
            SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS totalPending,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS totalApproved,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS totalRejected
        FROM inventory_requests
    `;
    const [rows] = await db.execute(query);
    return {
        totalPending: rows[0].totalPending || 0,
        totalApproved: rows[0].totalApproved || 0,
        totalRejected: rows[0].totalRejected || 0
    };
}

// 2. Route untuk nampilin UI Inbox (Hanya yang berstatus 'submitted')
router.get('/inbox', async (req, res) => {
    try {
        const stats = await getStats();
        
        // Query JOIN untuk mengambil data pengadaan beserta nama pemohon
        const query = `
            SELECT p.id, p.request_number, p.status, p.created_at, e.name AS pemohon_name, a.notes
            FROM inventory_requests p
            JOIN employees e ON p.employee_id = e.id
            LEFT JOIN inventory_request_approvals a ON p.id = a.inventory_request_id
            WHERE p.status = 'submitted'
            ORDER BY p.created_at DESC
        `;
        const [procurements] = await db.execute(query);

        res.render('inbox', {
            title: 'Inbox Wakil Dekan',
            user: req.session.username,
            tab: 'inbox',
            procurements: procurements,
            totalPending: stats.totalPending,
            totalApproved: stats.totalApproved,
            totalRejected: stats.totalRejected
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal mengambil data Inbox dari database.");
    }
});

// 3. Route untuk nampilin UI Archive / History (Hanya 'approved' & 'rejected')
router.get('/history', async (req, res) => {
    try {
        const stats = await getStats();
        
        const query = `
            SELECT p.id, p.request_number, p.status, p.created_at, e.name AS pemohon_name, a.notes
            FROM inventory_requests p
            JOIN employees e ON p.employee_id = e.id
            LEFT JOIN inventory_request_approvals a ON p.id = a.inventory_request_id
            WHERE p.status IN ('approved', 'rejected')
            ORDER BY p.created_at DESC
        `;
        const [historyProcurements] = await db.execute(query);

        res.render('inbox', {
            title: 'Archive Pengadaan',
            user: req.session.username,
            tab: 'history',
            procurements: historyProcurements,
            totalPending: stats.totalPending,
            totalApproved: stats.totalApproved,
            totalRejected: stats.totalRejected
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal mengambil data Archive dari database.");
    }
});

// 4. Route untuk Export PDF/Excel
router.get('/rekap/export', async (req, res) => {
    const format = req.query.format;
    try {
        // Ambil data riwayat
        const query = `
            SELECT p.request_number, p.status, p.created_at, e.name AS pemohon_name, a.notes
            FROM inventory_requests p
            JOIN employees e ON p.employee_id = e.id
            LEFT JOIN inventory_request_approvals a ON p.id = a.inventory_request_id
            WHERE p.status IN ('approved', 'rejected')
            ORDER BY p.created_at DESC
        `;
        const [historyProcurements] = await db.execute(query);

        if (format === 'pdf') {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });
            let filename = "Rekap_Approval_Pengadaan.pdf";
            
            res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
            res.setHeader('Content-type', 'application/pdf');
            
            doc.pipe(res);
            
            // Header PDF
            doc.fontSize(20).font('Helvetica-Bold').text('Laporan Riwayat Persetujuan', { align: 'center' });
            doc.fontSize(12).font('Helvetica').text('Sistem Informasi Pengadaan (FacultyWare)', { align: 'center' });
            doc.moveDown(2);
            
            // Konten Data
            historyProcurements.forEach((proc, index) => {
                doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. No. Pengajuan: ${proc.request_number}`);
                doc.fontSize(11).font('Helvetica').text(`Pemohon: ${proc.pemohon_name}`);
                doc.text(`Status: ${proc.status.toUpperCase()}`);
                doc.text(`Tanggal: ${new Date(proc.created_at).toLocaleDateString('id-ID')}`);
                if (proc.notes) {
                    doc.text(`Catatan: ${proc.notes}`);
                }
                doc.moveDown();
            });
            
            doc.end();

        } else if (format === 'excel') {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Riwayat Persetujuan');

            worksheet.columns = [
                { header: 'No', key: 'no', width: 5 },
                { header: 'No. Pengajuan', key: 'req_num', width: 20 },
                { header: 'Pemohon', key: 'requester', width: 25 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Tanggal', key: 'date', width: 15 },
                { header: 'Catatan', key: 'notes', width: 35 }
            ];

            // Styling header
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).alignment = { horizontal: 'center' };

            historyProcurements.forEach((proc, index) => {
                worksheet.addRow({
                    no: index + 1,
                    req_num: proc.request_number,
                    requester: proc.pemohon_name,
                    status: proc.status.toUpperCase(),
                    date: new Date(proc.created_at).toLocaleDateString('id-ID'),
                    notes: proc.notes || '-'
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=' + 'Rekap_Approval_Pengadaan.xlsx');

            await workbook.xlsx.write(res);
            res.end();
        } else {
            res.status(400).send('Format tidak valid');
        }
    } catch (error) {
        console.error("Export Error:", error);
        res.status(500).send("Terjadi kesalahan saat mengekspor data.");
    }
});

// ==========================================
// RUTE EKSEKUSI (POST) - URL Format: /approval/901/approve
// ==========================================

// 5. Route untuk mengeksekusi APPROVE
router.post('/:id/approve', async (req, res) => {
    // Pakai satu koneksi khusus agar transaksi atomik (db adalah pool,
    // START/COMMIT terpisah bisa kena koneksi berbeda).
    const conn = await db.getConnection();
    try {
        const currentId = req.params.id;
        const approverId = req.session.userId;

        await conn.beginTransaction();
        await conn.execute('UPDATE inventory_requests SET status = ? WHERE id = ?', ['approved', currentId]);
        await conn.execute(
            'INSERT INTO inventory_request_approvals (inventory_request_id, approver_id, status, notes, action_date) VALUES (?, ?, ?, ?, NOW())',
            [currentId, approverId, 'approved', null]
        );
        await conn.commit();

        // Kembali ke halaman Inbox
        res.redirect('/approval/inbox');
    } catch (error) {
        await conn.rollback();
        console.error(error);
        res.status(500).send("Gagal memproses persetujuan.");
    } finally {
        conn.release();
    }
});

// 6. Route untuk mengeksekusi REJECT
router.post('/:id/reject', async (req, res) => {
    // Pakai satu koneksi khusus agar transaksi atomik (lihat catatan di /approve).
    const conn = await db.getConnection();
    try {
        const currentId = req.params.id;
        const note = (req.body && (req.body.notes || req.body.note)) || null;
        const approverId = req.session.userId;

        await conn.beginTransaction();
        await conn.execute('UPDATE inventory_requests SET status = ? WHERE id = ?', ['rejected', currentId]);
        await conn.execute(
            'INSERT INTO inventory_request_approvals (inventory_request_id, approver_id, status, notes, action_date) VALUES (?, ?, ?, ?, NOW())',
            [currentId, approverId, 'rejected', note]
        );
        await conn.commit();

        // Kembali ke halaman Inbox
        res.redirect('/approval/inbox');
    } catch (error) {
        await conn.rollback();
        console.error(error);
        res.status(500).send("Gagal memproses penolakan.");
    } finally {
        conn.release();
    }
});

// ==========================================
// RUTE WILDCARD (WAJIB PALING BAWAH)
// ==========================================

// 7. Route untuk nampilin UI Detail
router.get('/:id', async (req, res) => {
    try {
        const currentId = req.params.id;

        // Ambil data utama pengadaan
        const queryProcurement = `
            SELECT p.*, e.name AS pemohon_name, a.notes
            FROM inventory_requests p
            JOIN employees e ON p.employee_id = e.id
            LEFT JOIN inventory_request_approvals a ON p.id = a.inventory_request_id
            WHERE p.id = ?
        `;
        const [procurementResult] = await db.execute(queryProcurement, [currentId]);

        if (procurementResult.length === 0) {
            return res.status(404).send("Data permintaan tidak ditemukan.");
        }

        // Ambil daftar barang (items) untuk pengadaan ini
        const queryItems = `
            SELECT item_name, quantity
            FROM inventory_request_details
            WHERE inventory_request_id = ?
        `;
        const [itemsResult] = await db.execute(queryItems, [currentId]);

        res.render('detail', {
            title: 'Detail Permintaan',
            user: req.session.username,
            procurement: procurementResult[0],
            items: itemsResult
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal mengambil detail data dari database.");
    }
});

module.exports = router;