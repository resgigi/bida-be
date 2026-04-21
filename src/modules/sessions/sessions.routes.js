const router = require('express').Router();
const controller = require('./sessions.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.get('/assignable-staff', controller.getAssignableStaff);
router.get('/', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER', 'STAFF'), controller.getAll);
router.get('/:id', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER', 'STAFF'), controller.getById);
router.post('/start', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER', 'STAFF'), controller.startSession);
router.put('/:id/end', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER', 'STAFF'), controller.endSession);
router.put('/:id/cancel', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.cancelSession);
router.put('/:id/transfer-room', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.transferRoom);
router.post('/:id/request-payment', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER', 'STAFF'), controller.requestPayment);
router.post('/:id/checkout', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.checkout);

module.exports = router;
