const express = require('express'); 
const router = express.Router();    
const purchaseController = require('../controllers/purchaseController'); 
const { checkPermission } = require('../middlewares/acl');

router.get('/', checkPermission('manage_po'), purchaseController.index);

router.get('/create', checkPermission('manage_po'), purchaseController.create);

router.post('/create', checkPermission('manage_po'), purchaseController.store);

router.get('/api/list', checkPermission('manage_po'), purchaseController.apiList);
router.get('/api/purchase', checkPermission('manage_po'), purchaseController.apiList);

router.get('/api/procurement/:id/items', checkPermission('manage_po'), purchaseController.procurementItems);

router.get('/dashboard', checkPermission('manage_po'), purchaseController.dashboard);
router.get('/:id/export', checkPermission(['manage_po', 'manage_approval']), purchaseController.exportPDF);

router.post('/:id/status', checkPermission('manage_po'), purchaseController.updateStatus);

router.post('/:id/approve', checkPermission('manage_approval'), purchaseController.approve);
router.post('/:id/reject', checkPermission('manage_approval'), purchaseController.reject);

router.get('/:id', checkPermission(['manage_po', 'manage_approval']), purchaseController.detail);

module.exports = router; 
