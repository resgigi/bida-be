const router = require('express').Router();
const controller = require('./orders.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.post('/:sessionId/items', controller.addItem);
router.put('/items/:id', controller.updateItem);
router.delete('/items/:id', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.removeItem);

module.exports = router;
