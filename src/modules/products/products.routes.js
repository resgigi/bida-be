const router = require('express').Router();
const controller = require('./products.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.get('/categories', controller.getCategories);
router.post('/categories', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.createCategory);
router.put('/categories/:id', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.updateCategory);
router.delete('/categories/:id', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.deleteCategory);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.create);
router.put('/:id', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'MANAGER', 'CASHIER'), controller.remove);

module.exports = router;
