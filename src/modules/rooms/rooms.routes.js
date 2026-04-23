const router = require('express').Router();
const controller = require('./rooms.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.create);
router.put('/:id', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.remove);

module.exports = router;
