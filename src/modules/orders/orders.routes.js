const router = require('express').Router();
const controller = require('./orders.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);
router.post('/:sessionId/items', controller.addItem);
router.put('/items/:id', controller.updateItem);
router.delete('/items/:id', controller.removeItem);

module.exports = router;
