const express = require('express');
const router = express.Router();
const controller = require('../controllers/pengadaanController');
const { isAuthenticated } = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/acl');

router.use(isAuthenticated);
router.use(checkPermission('manage_procurement'));

router.get('/', controller.index);
router.get('/create', controller.create);
router.post('/create', controller.store);
router.get('/api/request/:requestNumber/items', controller.requestItems);
router.get('/:id', controller.detail);

module.exports = router;
