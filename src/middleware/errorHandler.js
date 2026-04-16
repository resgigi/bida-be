const { error } = require('../utils/response');

function errorHandler(err, req, res, _next) {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Lỗi hệ thống';
  return error(res, message, statusCode);
}

module.exports = errorHandler;
