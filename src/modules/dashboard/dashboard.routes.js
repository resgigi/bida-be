const router = require('express').Router();
const controller = require('./dashboard.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));
router.get('/stats', controller.getStats);
router.get('/revenue-chart', controller.getRevenueChart);
router.get('/top-products', controller.getTopProducts);
router.get('/recent-sessions', controller.getRecentSessions);

module.exports = router;
