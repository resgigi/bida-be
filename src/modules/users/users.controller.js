const bcrypt = require('bcryptjs');
const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { logAction } = require('../../utils/audit');

exports.getAll = async (req, res) => {
  try {
    const { role, isActive } = req.query;
    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    const users = await prisma.user.findMany({
      where,
      select: { id: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, users);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
    });
    if (!user) return error(res, 'Nhân viên không tồn tại', 404);
    return success(res, user);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.create = async (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return error(res, 'Tên đăng nhập đã tồn tại', 400);
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashed, fullName, role: role || 'STAFF' },
      select: { id: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
    });
    await logAction(req.user.id, 'CREATE', 'User', user.id, { username, role });
    return success(res, user, 'Tạo nhân viên thành công', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.update = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, username: true, fullName: true, role: true, isActive: true, createdAt: true },
    });
    await logAction(req.user.id, 'UPDATE', 'User', user.id, { fullName: user.fullName });
    return success(res, user, 'Cập nhật nhân viên thành công');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.remove = async (req, res) => {
  try {
    if (req.params.id === req.user.id) return error(res, 'Không thể xóa chính mình', 400);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return error(res, 'Nhân viên không tồn tại', 404);
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    await logAction(req.user.id, 'DELETE', 'User', req.params.id, { username: user.username });
    return success(res, null, 'Vô hiệu hóa nhân viên thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
