const router = require('express').Router();
const controller = require('./rooms.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', authorize('SUPER_ADMIN', 'MANAGER'), controller.create);
router.put('/:id', authorize('SUPER_ADMIN', 'MANAGER'), controller.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'MANAGER'), controller.remove);

module.exports = router;
