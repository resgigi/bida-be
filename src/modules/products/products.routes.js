const router = require('express').Router();
const controller = require('./products.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.get('/categories', controller.getCategories);
router.post('/categories', authorize('SUPER_ADMIN', 'MANAGER'), controller.createCategory);
router.put('/categories/:id', authorize('SUPER_ADMIN', 'MANAGER'), controller.updateCategory);
router.delete('/categories/:id', authorize('SUPER_ADMIN', 'MANAGER'), controller.deleteCategory);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', authorize('SUPER_ADMIN', 'MANAGER'), controller.create);
router.put('/:id', authorize('SUPER_ADMIN', 'MANAGER'), controller.update);
router.delete('/:id', authorize('SUPER_ADMIN', 'MANAGER'), controller.remove);

module.exports = router;
