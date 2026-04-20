const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { logAction } = require('../../utils/audit');

function parseAuditDetails(details) {
  try {
    return JSON.parse(details || '{}');
  } catch {
    return {};
  }
}

function normalizeRoomAction(log) {
  return {
    id: log.id,
    action: log.action,
    createdAt: log.createdAt,
    by: log.user?.fullName || log.user?.username || 'N/A',
    details: parseAuditDetails(log.details),
  };
}

const SESSION_STATUSES = ['ACTIVE', 'PAYMENT_REQUESTED', 'COMPLETED', 'CANCELLED'];

exports.getAll = async (req, res) => {
  try {
    const {
      status,
      statusIn,
      closed,
      roomId,
      from,
      to,
      search,
      roomAction = '',
      roomActionBy = '',
      page = 1,
      limit = 20,
    } = req.query;
    const where = {};
    const statusInRaw = statusIn && String(statusIn).trim();
    if (statusInRaw) {
      const parts = statusInRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const valid = parts.filter((p) => SESSION_STATUSES.includes(p));
      if (valid.length > 0) where.status = { in: valid };
      else where.id = { in: ['__NO_MATCH__'] };
    } else if (String(closed) === '1') {
      where.status = { in: ['COMPLETED', 'CANCELLED'] };
    } else if (status) {
      where.status = status;
    }
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
    if (roomAction || roomActionBy.trim()) {
      let actionFilter = null;
      if (roomAction === 'HAS_ACTION') actionFilter = { in: ['CANCEL_SESSION', 'TRANSFER_ROOM'] };
      if (roomAction === 'CANCELLED_ONLY') actionFilter = 'CANCEL_SESSION';
      if (roomAction === 'TRANSFER_ONLY') actionFilter = 'TRANSFER_ROOM';

      const actorKeyword = roomActionBy.trim();
      const actionRows = await prisma.auditLog.findMany({
        where: {
          entity: 'Session',
          action: actionFilter || { in: ['CANCEL_SESSION', 'TRANSFER_ROOM'] },
          ...(actorKeyword
            ? {
              user: {
                OR: [
                  { fullName: { contains: actorKeyword, mode: 'insensitive' } },
                  { username: { contains: actorKeyword, mode: 'insensitive' } },
                ],
              },
            }
            : {}),
        },
        select: { entityId: true },
        distinct: ['entityId'],
      });
      const sessionIds = actionRows.map((row) => row.entityId).filter(Boolean);
      where.id = sessionIds.length > 0 ? { in: sessionIds } : { in: ['__NO_MATCH__'] };
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

    const sessionIds = sessions.map((s) => s.id);
    const logs = sessionIds.length > 0
      ? await prisma.auditLog.findMany({
        where: {
          entity: 'Session',
          entityId: { in: sessionIds },
          action: { in: ['CANCEL_SESSION', 'TRANSFER_ROOM'] },
        },
        include: { user: { select: { fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      })
      : [];

    const actionsBySession = logs.reduce((acc, log) => {
      if (!acc[log.entityId]) acc[log.entityId] = [];
      acc[log.entityId].push(normalizeRoomAction(log));
      return acc;
    }, {});

    const sessionsWithActions = sessions.map((s) => ({
      ...s,
      roomActions: actionsBySession[s.id] || [],
    }));

    return success(res, { sessions: sessionsWithActions, total, page: Number(page), limit: take });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getAssignableStaff = async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['STAFF', 'CASHIER', 'MANAGER', 'SUPER_ADMIN'] } },
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

    const roomActionLogs = await prisma.auditLog.findMany({
      where: {
        entity: 'Session',
        entityId: session.id,
        action: { in: ['CANCEL_SESSION', 'TRANSFER_ROOM'] },
      },
      include: { user: { select: { fullName: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return success(res, {
      ...session,
      roomActions: roomActionLogs.map(normalizeRoomAction),
    });
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
        where: { id: bodyStaffId, isActive: true, role: { in: ['STAFF', 'CASHIER', 'MANAGER', 'SUPER_ADMIN'] } },
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

exports.requestPayment = async (req, res) => {
  try {
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

    const requested = await prisma.session.update({
      where: { id: req.params.id },
      data: {
        endTime,
        totalPlayAmount,
        totalFoodAmount,
        status: 'PAYMENT_REQUESTED',
        paymentRequestedBy: req.user.id,
        paymentRequestedAt: new Date(),
      },
      include: { room: true, staff: { select: { id: true, fullName: true } }, orderItems: { include: { product: true } } },
    });

    await logAction(req.user.id, 'REQUEST_PAYMENT', 'Session', session.id, {
      roomName: requested.room?.name,
      totalPlayAmount,
      totalFoodAmount,
    });

    if (req.app.get('io')) {
      req.app.get('io').emit('session:payment-requested', requested);
    }

    return success(res, requested, 'Đã gửi yêu cầu thanh toán');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.cancelSession = async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return error(res, 'Vui lòng nhập lý do hủy phòng', 400);

    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: { room: true, orderItems: true },
    });
    if (!session) return error(res, 'Phiên không tồn tại', 404);
    if (session.status === 'COMPLETED') return error(res, 'Phiên đã thanh toán, không thể hủy', 400);
    if (session.status === 'CANCELLED') return error(res, 'Phiên đã hủy trước đó', 400);

    const endTime = session.endTime || new Date();
    const durationMs = endTime - new Date(session.startTime);
    const durationHours = durationMs / (1000 * 60 * 60);
    const totalPlayAmount = Math.round(durationHours * session.room.pricePerHour);
    const totalFoodAmount = session.orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

    const cancelled = await prisma.session.update({
      where: { id: req.params.id },
      data: {
        endTime,
        totalPlayAmount,
        totalFoodAmount,
        totalAmount: 0,
        paidAmount: 0,
        status: 'CANCELLED',
      },
      include: { room: true, staff: { select: { id: true, fullName: true } }, orderItems: { include: { product: true } } },
    });

    await prisma.room.update({ where: { id: session.roomId }, data: { status: 'AVAILABLE' } });
    await logAction(req.user.id, 'CANCEL_SESSION', 'Session', session.id, {
      roomName: session.room?.name,
      previousStatus: session.status,
      totalPlayAmount,
      totalFoodAmount,
      reason,
    });

    if (req.app.get('io')) {
      req.app.get('io').emit('room:updated', { roomId: session.roomId, status: 'AVAILABLE' });
      req.app.get('io').emit('session:cancelled', cancelled);
    }

    return success(res, cancelled, 'Đã hủy phiên và trả phòng về trạng thái trống');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.transferRoom = async (req, res) => {
  try {
    const { targetRoomId } = req.body;
    const reason = String(req.body?.reason || '').trim();
    if (!targetRoomId) return error(res, 'Vui lòng chọn phòng cần chuyển đến', 400);
    if (!reason) return error(res, 'Vui lòng nhập lý do chuyển phòng', 400);

    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: { room: true, orderItems: true },
    });
    if (!session) return error(res, 'Phiên không tồn tại', 404);
    if (session.status !== 'ACTIVE') {
      return error(res, 'Chỉ chuyển phòng khi phiên đang hoạt động', 400);
    }
    if (session.roomId === targetRoomId) {
      return error(res, 'Phòng chuyển đến trùng với phòng hiện tại', 400);
    }

    const targetRoom = await prisma.room.findUnique({ where: { id: targetRoomId } });
    if (!targetRoom) return error(res, 'Phòng chuyển đến không tồn tại', 404);
    if (targetRoom.status === 'MAINTENANCE') return error(res, 'Phòng chuyển đến đang bảo trì', 400);
    if (targetRoom.status !== 'AVAILABLE') return error(res, 'Phòng chuyển đến không còn trống', 400);

    const transferred = await prisma.$transaction(async (tx) => {
      await tx.room.update({ where: { id: session.roomId }, data: { status: 'AVAILABLE' } });
      await tx.room.update({ where: { id: targetRoomId }, data: { status: 'IN_USE' } });
      return tx.session.update({
        where: { id: session.id },
        data: { roomId: targetRoomId },
        include: { room: true, staff: { select: { id: true, fullName: true } }, orderItems: { include: { product: true } } },
      });
    });

    await logAction(req.user.id, 'TRANSFER_ROOM', 'Session', session.id, {
      fromRoomId: session.roomId,
      fromRoomName: session.room?.name,
      toRoomId: targetRoomId,
      toRoomName: targetRoom.name,
      keptOrderItems: session.orderItems.length,
      reason,
    });

    if (req.app.get('io')) {
      req.app.get('io').emit('room:updated', { roomId: session.roomId, status: 'AVAILABLE' });
      req.app.get('io').emit('room:updated', { roomId: targetRoomId, status: 'IN_USE' });
      req.app.get('io').emit('session:transferred', transferred);
    }

    return success(res, transferred, 'Chuyển phòng thành công, đã giữ nguyên giờ chơi và món đã gọi');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.checkout = async (req, res) => {
  try {
    const { discountAmount = 0, discountPercent = 0, paidAmount, paymentMethod = 'CASH', note = '', playAmountOverride } = req.body;

    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: { room: true, orderItems: true },
    });
    if (!session) return error(res, 'Phiên không tồn tại', 404);
    if (session.status === 'COMPLETED') return error(res, 'Phiên đã thanh toán', 400);
    if (session.status !== 'PAYMENT_REQUESTED') {
      return error(res, 'Phiên chưa được yêu cầu thanh toán', 400);
    }

    const endTime = session.endTime || new Date();
    const durationMs = endTime - new Date(session.startTime);
    const durationHours = durationMs / (1000 * 60 * 60);
    let totalPlayAmount = Math.round(durationHours * session.room.pricePerHour);
    if (playAmountOverride !== undefined && playAmountOverride !== null && playAmountOverride !== '') {
      const safeOverride = Math.max(0, Math.round(Number(playAmountOverride)));
      if (Number.isFinite(safeOverride)) totalPlayAmount = safeOverride;
    }
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
        approvedBy: req.user.id,
        note,
      },
      include: { room: true, staff: { select: { id: true, fullName: true } }, orderItems: { include: { product: true } } },
    });

    await prisma.room.update({ where: { id: session.roomId }, data: { status: 'AVAILABLE' } });
    await logAction(req.user.id, 'CHECKOUT', 'Session', session.id, {
      totalAmount,
      paymentMethod,
      playAmountOverride: playAmountOverride !== undefined ? playAmountOverride : undefined,
    });

    if (req.app.get('io')) {
      req.app.get('io').emit('room:updated', { roomId: session.roomId, status: 'AVAILABLE' });
      req.app.get('io').emit('session:completed', updated);
    }

    return success(res, updated, 'Thanh toán thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
