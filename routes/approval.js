const express = require('express');
const router = express.Router();
const db = require('../lib/db'); // Pastikan path ini benar mengarah ke konfigurasi DB

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
        FROM inventory_procurements
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
            SELECT p.id, p.request_number, p.title, p.status, p.created_at, e.name AS pemohon_name
            FROM inventory_procurements p
            JOIN employees e ON p.created_by = e.id
            WHERE p.status = 'submitted'
            ORDER BY p.created_at DESC
        `;
        const [procurements] = await db.execute(query);

        res.render('inbox', { 
            title: 'Inbox Wakil Dekan',
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
            SELECT p.id, p.request_number, p.title, p.status, p.created_at, e.name AS pemohon_name
            FROM inventory_procurements p
            JOIN employees e ON p.created_by = e.id
            WHERE p.status IN ('approved', 'rejected')
            ORDER BY p.created_at DESC
        `;
        const [historyProcurements] = await db.execute(query);

        res.render('inbox', { 
            title: 'Archive Pengadaan',
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
router.get('/rekap/export', (req, res) => {
    const format = req.query.format;
    if (format === 'pdf') {
        res.send('Ini simulasi: File PDF berhasil digenerate dan didownload!');
    } else if (format === 'excel') {
        res.send('Ini simulasi: File Excel berhasil digenerate dan didownload!');
    } else {
        res.status(400).send('Format tidak valid');
    }
});

// ==========================================
// RUTE EKSEKUSI (POST) - URL Format: /approval/901/approve
// ==========================================

// 5. Route untuk mengeksekusi APPROVE
router.post('/:id/approve', async (req, res) => {
    try {
        const currentId = req.params.id;
        // Ubah status di database jadi 'approved'
        await db.execute('UPDATE inventory_procurements SET status = ? WHERE id = ?', ['approved', currentId]);
        
        // Silent Success: Langsung lempar balik ke halaman Inbox
        res.redirect('/approval/inbox');
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal memproses persetujuan.");
    }
});

// 6. Route untuk mengeksekusi REJECT
router.post('/:id/reject', async (req, res) => {
    try {
        const currentId = req.params.id;
        
        // Ubah status di database jadi 'rejected'
        await db.execute('UPDATE inventory_procurements SET status = ? WHERE id = ?', ['rejected', currentId]);
        
        // Silent Success: Langsung lempar balik ke halaman Inbox
        res.redirect('/approval/inbox');
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal memproses penolakan.");
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
            SELECT p.*, e.name AS pemohon_name
            FROM inventory_procurements p
            JOIN employees e ON p.created_by = e.id
            WHERE p.id = ?
        `;
        const [procurementResult] = await db.execute(queryProcurement, [currentId]);

        if (procurementResult.length === 0) {
            return res.status(404).send("Data permintaan tidak ditemukan.");
        }

        // Ambil daftar barang (items) untuk pengadaan ini
        const queryItems = `
            SELECT item_name, quantity
            FROM inventory_procurement_items
            WHERE inventory_procurement_id = ?
        `;
        const [itemsResult] = await db.execute(queryItems, [currentId]);

        res.render('detail', { 
            procurement: procurementResult[0], 
            items: itemsResult 
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal mengambil detail data dari database.");
    }
});

module.exports = router;