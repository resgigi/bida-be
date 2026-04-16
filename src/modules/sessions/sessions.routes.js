const router = require('express').Router();
const controller = require('./sessions.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);
router.get('/assignable-staff', controller.getAssignableStaff);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/start', controller.startSession);
router.put('/:id/end', controller.endSession);
router.post('/:id/checkout', controller.checkout);

module.exports = router;
