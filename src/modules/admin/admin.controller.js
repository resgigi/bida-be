const bcrypt = require('bcryptjs');
const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { logAction } = require('../../utils/audit');

async function verifyPassword(userId, password) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return bcrypt.compare(password, user.password);
}

exports.deleteAllSessions = async (req, res) => {
  try {
    const { password, confirmation } = req.body;
    if (confirmation !== 'XOA TAT CA') return error(res, 'Vui lòng nhập đúng "XOA TAT CA" để xác nhận', 400);
    const valid = await verifyPassword(req.user.id, password);
    if (!valid) return error(res, 'Mật khẩu không đúng', 401);

    const count = await prisma.session.count();
    await prisma.orderItem.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { entity: 'Session' } });
    await prisma.room.updateMany({ data: { status: 'AVAILABLE' } });
    await logAction(req.user.id, 'DELETE_ALL', 'Session', '', { count });
    return success(res, { deletedCount: count }, `Đã xóa ${count} phiên chơi`);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.deleteAllProducts = async (req, res) => {
  try {
    const { password, confirmation } = req.body;
    if (confirmation !== 'XOA TAT CA') return error(res, 'Vui lòng nhập đúng "XOA TAT CA" để xác nhận', 400);
    const valid = await verifyPassword(req.user.id, password);
    if (!valid) return error(res, 'Mật khẩu không đúng', 401);

    const count = await prisma.product.count();
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await logAction(req.user.id, 'DELETE_ALL', 'Product', '', { count });
    return success(res, { deletedCount: count }, `Đã xóa ${count} sản phẩm`);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.deleteAllRooms = async (req, res) => {
  try {
    const { password, confirmation } = req.body;
    if (confirmation !== 'XOA TAT CA') return error(res, 'Vui lòng nhập đúng "XOA TAT CA" để xác nhận', 400);
    const valid = await verifyPassword(req.user.id, password);
    if (!valid) return error(res, 'Mật khẩu không đúng', 401);

    const activeSessions = await prisma.session.count({ where: { status: 'ACTIVE' } });
    if (activeSessions > 0) return error(res, 'Không thể xóa khi còn phiên chơi đang hoạt động', 400);

    const count = await prisma.room.count();
    await prisma.room.deleteMany({});
    await logAction(req.user.id, 'DELETE_ALL', 'Room', '', { count });
    return success(res, { deletedCount: count }, `Đã xóa ${count} phòng`);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.deleteAllData = async (req, res) => {
  try {
    const { password, confirmation } = req.body;
    if (confirmation !== 'XOA TAT CA') return error(res, 'Vui lòng nhập đúng "XOA TAT CA" để xác nhận', 400);
    const valid = await verifyPassword(req.user.id, password);
    if (!valid) return error(res, 'Mật khẩu không đúng', 401);

    await prisma.orderItem.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.dailyReport.deleteMany({});
    await prisma.auditLog.deleteMany({});

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'DELETE_ALL',
        entity: 'ALL_DATA',
        entityId: '',
        details: JSON.stringify({ action: 'Reset toàn bộ dữ liệu (bao gồm nhật ký thao tác)' }),
      },
    });

    return success(res, null, 'Đã xóa toàn bộ dữ liệu (trừ tài khoản)');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, entity, action } = req.query;
    const where = {};
    if (entity) where.entity = entity;
    if (action) where.action = action;
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);
    return success(res, { logs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getSettings = async (_req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const obj = {};
    settings.forEach((s) => { obj[s.key] = s.value; });
    return success(res, obj);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    if (
      Object.prototype.hasOwnProperty.call(req.body, 'stockManagementEnabled')
      && req.user.role !== 'SUPER_ADMIN'
    ) {
      return error(res, 'Chỉ Admin tổng mới được thay đổi cài đặt quản lý tồn kho', 403);
    }

    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    await logAction(req.user.id, 'UPDATE', 'Setting', '', req.body);
    return success(res, null, 'Cập nhật cài đặt thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
