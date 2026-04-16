const router = require('express').Router();
const controller = require('./admin.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.delete('/data/sessions', authorize('SUPER_ADMIN', 'MANAGER'), controller.deleteAllSessions);
router.delete('/data/products', authorize('SUPER_ADMIN', 'MANAGER'), controller.deleteAllProducts);
router.delete('/data/rooms', authorize('SUPER_ADMIN', 'MANAGER'), controller.deleteAllRooms);
router.delete('/data/all', authorize('SUPER_ADMIN'), controller.deleteAllData);
router.get('/audit-logs', authorize('SUPER_ADMIN', 'MANAGER'), controller.getAuditLogs);
router.get('/settings', controller.getSettings);
router.put('/settings', authorize('SUPER_ADMIN', 'MANAGER'), controller.updateSettings);

module.exports = router;
