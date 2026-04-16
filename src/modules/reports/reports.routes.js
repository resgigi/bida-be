const router = require('express').Router();
const controller = require('./reports.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.get('/daily', authorize('SUPER_ADMIN', 'MANAGER', 'STAFF'), controller.getDailyReport);
router.post('/daily/generate', authorize('SUPER_ADMIN', 'MANAGER', 'STAFF'), controller.generateDailyReport);
router.get('/revenue', authorize('SUPER_ADMIN', 'MANAGER', 'STAFF'), controller.getRevenueReport);
router.get('/sessions', authorize('SUPER_ADMIN', 'MANAGER', 'STAFF'), controller.getSessionHistory);
router.get('/sold-items', authorize('SUPER_ADMIN', 'MANAGER', 'STAFF'), controller.getSoldItemsByDay);

module.exports = router;
