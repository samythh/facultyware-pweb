const express = require('express'); // Import framework Express
const router = express.Router();    // Buat instance router
const purchaseController = require('../controllers/purchaseController'); // Import controller
// const { checkPermission } = require('../middlewares/acl'); // TODO: Enable for production

// Daftar PO (list semua Purchase Order)
router.get('/', purchaseController.index);

// Form buat PO (halaman create)
router.get('/create', purchaseController.create);

// Simpan PO baru (proses POST form create)
router.post('/create', purchaseController.store);

// API JSON untuk daftar PO
// NOTE: define API and non-:id routes before the '/:id' param route
router.get('/api/list', purchaseController.apiList);
router.get('/api/purchase', purchaseController.apiList);

// API: items untuk procurement tertentu (dipakai oleh halaman create)
router.get('/api/procurement/:id/items', purchaseController.procurementItems);

// Dashboard statistik (mounted under /purchase/dashboard)
// NOTE: removed checkPermission for testing — restore as needed.
router.get('/dashboard', purchaseController.dashboard);

// Export PO ke PDF (static before param)
router.get('/:id/export', purchaseController.exportPDF);

// Update status PO (draft → completed)
router.post('/:id/status', purchaseController.updateStatus);

// Detail PO berdasarkan ID (param last)
router.get('/:id', purchaseController.detail);

module.exports = router; // Export router supaya bisa dipakai di app.js
