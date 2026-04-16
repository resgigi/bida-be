const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return error(res, 'Không có quyền truy cập', 401);
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return error(res, 'Token không hợp lệ hoặc đã hết hạn', 401);
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return error(res, 'Bạn không có quyền thực hiện thao tác này', 403);
    }
    next();
  };
}

module.exports = { authenticate, authorize };
