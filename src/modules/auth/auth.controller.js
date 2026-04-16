const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } = require('../../config/constants');

function generateTokens(user) {
  const payload = { id: user.id, username: user.username, role: user.role, fullName: user.fullName };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
}

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return error(res, 'Vui lòng nhập tên đăng nhập và mật khẩu', 400);
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      return error(res, 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa', 401);
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return error(res, 'Mật khẩu không đúng', 401);
    }
    const tokens = generateTokens(user);
    return success(res, {
      ...tokens,
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    }, 'Đăng nhập thành công');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return error(res, 'Refresh token is required', 400);
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.isActive) return error(res, 'User not found', 401);
    const tokens = generateTokens(user);
    return success(res, tokens, 'Token refreshed');
  } catch {
    return error(res, 'Invalid refresh token', 401);
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
    });
    return success(res, user);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return error(res, 'Mật khẩu hiện tại không đúng', 400);
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    return success(res, null, 'Đổi mật khẩu thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
