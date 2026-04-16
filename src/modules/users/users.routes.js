const router = require('express').Router();
const controller = require('./users.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.get('/', authorize('SUPER_ADMIN', 'MANAGER'), controller.getAll);
router.get('/:id', authorize('SUPER_ADMIN', 'MANAGER'), controller.getById);
router.post('/', authorize('SUPER_ADMIN'), controller.create);
router.put('/:id', authorize('SUPER_ADMIN'), controller.update);
router.delete('/:id', authorize('SUPER_ADMIN'), controller.remove);

module.exports = router;
