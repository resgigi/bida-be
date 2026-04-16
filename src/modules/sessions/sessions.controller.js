const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { logAction } = require('../../utils/audit');

exports.getAll = async (req, res) => {
  try {
    const { status, roomId, from, to, search, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (roomId) where.roomId = roomId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }
    const q = search && String(search).trim();
    if (q) {
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { room: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Number(page) - 1) * take;
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: {
          room: true,
          staff: { select: { id: true, fullName: true, username: true } },
          orderItems: { include: { product: { include: { category: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.session.count({ where }),
    ]);
    return success(res, { sessions, total, page: Number(page), limit: take });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getAssignableStaff = async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['STAFF', 'MANAGER', 'SUPER_ADMIN'] } },
      select: { id: true, fullName: true, username: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    return success(res, users);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getById = async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: {
        room: true,
        staff: { select: { id: true, fullName: true, username: true } },
        orderItems: { include: { product: { include: { category: true } } } },
      },
    });
    if (!session) return error(res, 'Phiên không tồn tại', 404);
    return success(res, session);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.startSession = async (req, res) => {
  try {
    const { roomId, staffId: bodyStaffId } = req.body;
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return error(res, 'Phòng không tồn tại', 404);
    if (room.status === 'IN_USE') return error(res, 'Phòng đang được sử dụng', 400);
    if (room.status === 'MAINTENANCE') return error(res, 'Phòng đang bảo trì', 400);

    let staffId = req.user.id;
    if (bodyStaffId && bodyStaffId !== req.user.id) {
      if (req.user.role === 'STAFF') {
        return error(res, 'Nhân viên chỉ được chọn chính mình làm người phụ trách', 403);
      }
      const assignee = await prisma.user.findFirst({
        where: { id: bodyStaffId, isActive: true, role: { in: ['STAFF', 'MANAGER', 'SUPER_ADMIN'] } },
      });
      if (!assignee) return error(res, 'Nhân viên phụ trách không hợp lệ', 400);
      staffId = bodyStaffId;
    }

    const session = await prisma.session.create({
      data: { roomId, staffId, startTime: new Date() },
      include: { room: true, staff: { select: { id: true, fullName: true, username: true } } },
    });
    await prisma.room.update({ where: { id: roomId }, data: { status: 'IN_USE' } });
    await logAction(req.user.id, 'START_SESSION', 'Session', session.id, { roomName: room.name, staffId, staffName: session.staff?.fullName });

    if (req.app.get('io')) {
      req.app.get('io').emit('room:updated', { roomId, status: 'IN_USE' });
      req.app.get('io').emit('session:started', session);
    }

    return success(res, session, 'Bắt đầu phiên chơi', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.endSession = async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: { room: true, orderItems: true },
    });
    if (!session) return error(res, 'Phiên không tồn tại', 404);
    if (session.status !== 'ACTIVE') return error(res, 'Phiên đã kết thúc', 400);

    const endTime = new Date();
    const durationMs = endTime - new Date(session.startTime);
    const durationHours = durationMs / (1000 * 60 * 60);
    const totalPlayAmount = Math.round(durationHours * session.room.pricePerHour);
    const totalFoodAmount = session.orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

    const updated = await prisma.session.update({
      where: { id: req.params.id },
      data: { endTime, totalPlayAmount, totalFoodAmount, status: 'ACTIVE' },
      include: { room: true, staff: { select: { id: true, fullName: true } }, orderItems: { include: { product: true } } },
    });

    return success(res, updated, 'Đã tính tiền phiên chơi');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.checkout = async (req, res) => {
  try {
    const { discountAmount = 0, discountPercent = 0, paidAmount, paymentMethod = 'CASH', note = '' } = req.body;

    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: { room: true, orderItems: true },
    });
    if (!session) return error(res, 'Phiên không tồn tại', 404);
    if (session.status === 'COMPLETED') return error(res, 'Phiên đã thanh toán', 400);

    const endTime = session.endTime || new Date();
    const durationMs = endTime - new Date(session.startTime);
    const durationHours = durationMs / (1000 * 60 * 60);
    const totalPlayAmount = Math.round(durationHours * session.room.pricePerHour);
    const totalFoodAmount = session.orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

    let finalDiscount = discountAmount;
    if (discountPercent > 0) {
      finalDiscount = Math.round((totalPlayAmount + totalFoodAmount) * discountPercent / 100);
    }
    const totalAmount = totalPlayAmount + totalFoodAmount - finalDiscount;

    const updated = await prisma.session.update({
      where: { id: req.params.id },
      data: {
        endTime,
        totalPlayAmount,
        totalFoodAmount,
        discountAmount: finalDiscount,
        discountPercent,
        totalAmount,
        paidAmount: paidAmount || totalAmount,
        paymentMethod,
        status: 'COMPLETED',
        note,
      },
      include: { room: true, staff: { select: { id: true, fullName: true } }, orderItems: { include: { product: true } } },
    });

    await prisma.room.update({ where: { id: session.roomId }, data: { status: 'AVAILABLE' } });
    await logAction(req.user.id, 'CHECKOUT', 'Session', session.id, { totalAmount, paymentMethod });

    if (req.app.get('io')) {
      req.app.get('io').emit('room:updated', { roomId: session.roomId, status: 'AVAILABLE' });
      req.app.get('io').emit('session:completed', updated);
    }

    return success(res, updated, 'Thanh toán thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
