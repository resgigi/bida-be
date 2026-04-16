const router = require('express').Router();
const controller = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');

router.post('/login', controller.login);
router.post('/refresh', controller.refreshToken);
router.get('/me', authenticate, controller.getMe);
router.put('/change-password', authenticate, controller.changePassword);

module.exports = router;
