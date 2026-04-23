const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { logAction } = require('../../utils/audit');

exports.getAll = async (req, res) => {
  try {
    const { status, type } = req.query;
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    const rooms = await prisma.room.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        sessions: {
          where: { status: { in: ['ACTIVE', 'PAYMENT_REQUESTED'] } },
          include: { orderItems: { include: { product: true } }, staff: { select: { fullName: true } } },
        },
      },
    });
    return success(res, rooms);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getById = async (req, res) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        sessions: {
          where: { status: { in: ['ACTIVE', 'PAYMENT_REQUESTED'] } },
          include: { orderItems: { include: { product: true } }, staff: { select: { fullName: true } } },
        },
      },
    });
    if (!room) return error(res, 'Phòng không tồn tại', 404);
    return success(res, room);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, pricePerHour, type, sortOrder } = req.body;
    const room = await prisma.room.create({
      data: { name, description: description || '', pricePerHour, type: type || 'NORMAL', sortOrder: sortOrder || 0 },
    });
    await logAction(req.user.id, 'CREATE', 'Room', room.id, { name });
    return success(res, room, 'Tạo phòng thành công', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.update = async (req, res) => {
  try {
    const room = await prisma.room.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await logAction(req.user.id, 'UPDATE', 'Room', room.id, req.body);
    return success(res, room, 'Cập nhật phòng thành công');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.remove = async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { id: req.params.id } });
    if (!room) return error(res, 'Phòng không tồn tại', 404);
    const activeSessions = await prisma.session.count({
      where: { roomId: req.params.id, status: { in: ['ACTIVE', 'PAYMENT_REQUESTED'] } },
    });
    if (activeSessions > 0) return error(res, 'Không thể xóa phòng đang có phiên chơi', 400);
    await prisma.room.delete({ where: { id: req.params.id } });
    await logAction(req.user.id, 'DELETE', 'Room', req.params.id, { name: room.name });
    return success(res, null, 'Xóa phòng thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
