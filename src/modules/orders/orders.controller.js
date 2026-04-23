const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { logAction } = require('../../utils/audit');

exports.addItem = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const quantity = Math.max(1, Number(req.body.quantity) || 1);
    const { productId } = req.body;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'ACTIVE') return error(res, 'Phiên không hợp lệ', 400);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return error(res, 'Sản phẩm không tồn tại', 404);
    if (!product.isActive) return error(res, 'Sản phẩm đang ngừng kinh doanh', 400);
    const stockManaged = product.trackStock === true;
    if (stockManaged && product.stock < quantity) return error(res, 'Không đủ tồn kho', 400);

    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderItem.findFirst({
        where: { sessionId, productId, confirmedAt: null },
      });
      const updatedItem = existing
        ? await tx.orderItem.update({
            where: { id: existing.id },
            data: {
              quantity: existing.quantity + quantity,
              totalPrice: (existing.quantity + quantity) * product.price,
            },
            include: { product: true },
          })
        : await tx.orderItem.create({
            data: {
              sessionId,
              productId,
              quantity,
              unitPrice: product.price,
              totalPrice: quantity * product.price,
            },
            include: { product: true },
          });

      if (stockManaged) {
        await tx.product.update({
          where: { id: productId },
          data: { stock: { decrement: quantity } },
        });
      }
      return updatedItem;
    });

    if (req.app.get('io')) {
      req.app.get('io').emit('order:updated', { sessionId });
    }

    return success(res, item, 'Thêm món thành công', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.updateItem = async (req, res) => {
  try {
    const quantity = Math.max(1, Number(req.body.quantity) || 1);
    const item = await prisma.orderItem.findUnique({ where: { id: req.params.id } });
    if (!item) return error(res, 'Không tìm thấy', 404);
    const session = await prisma.session.findUnique({
      where: { id: item.sessionId },
      include: { room: true },
    });
    if (!session || session.status !== 'ACTIVE') return error(res, 'Phiên không hợp lệ', 400);

    if (req.user.role === 'STAFF' && item.confirmedAt && quantity !== item.quantity) {
      return error(res, 'Nhân viên không được sửa món đã xác nhận đã gọi', 403);
    }
    if (req.user.role === 'STAFF' && quantity < item.quantity) {
      return error(res, 'Nhân viên không được giảm hoặc xóa món đã thêm', 403);
    }

    const delta = quantity - item.quantity;
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    const stockManaged = product && product.trackStock === true;
    if (stockManaged && delta > 0) {
      if (!product || product.stock < delta) return error(res, 'Không đủ tồn kho', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (stockManaged && delta > 0) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: delta } },
        });
      } else if (stockManaged && delta < 0) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: Math.abs(delta) } },
        });
      }

      return tx.orderItem.update({
        where: { id: req.params.id },
        data: { quantity, totalPrice: quantity * item.unitPrice },
        include: { product: true },
      });
    });

    if (delta < 0) {
      await logAction(req.user.id, 'ORDER_ITEM_QUANTITY_DECREASED', 'Session', item.sessionId, {
        roomName: session.room?.name,
        orderItemId: item.id,
        productId: item.productId,
        productName: product?.name || '',
        code: product?.code || '',
        previousQuantity: item.quantity,
        newQuantity: quantity,
        quantityReduced: -delta,
        unitPrice: item.unitPrice,
      });
    }

    if (req.app.get('io')) {
      req.app.get('io').emit('order:updated', { sessionId: item.sessionId });
    }
    return success(res, updated, 'Cập nhật thành công');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.removeItem = async (req, res) => {
  try {
    const item = await prisma.orderItem.findUnique({
      where: { id: req.params.id },
      include: { product: true },
    });
    if (!item) return error(res, 'Không tìm thấy', 404);
    const session = await prisma.session.findUnique({
      where: { id: item.sessionId },
      include: { room: true },
    });
    if (!session || (session.status !== 'ACTIVE' && session.status !== 'PAYMENT_REQUESTED')) {
      return error(res, 'Phiên không hợp lệ', 400);
    }

    const product = item.product || await prisma.product.findUnique({ where: { id: item.productId } });
    const stockManaged = product && product.trackStock === true;

    await prisma.$transaction(
      stockManaged
        ? [
            prisma.orderItem.delete({ where: { id: req.params.id } }),
            prisma.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            }),
          ]
        : [prisma.orderItem.delete({ where: { id: req.params.id } })],
    );

    await logAction(req.user.id, 'ORDER_ITEM_REMOVED', 'Session', item.sessionId, {
      roomName: session.room?.name,
      orderItemId: item.id,
      productId: item.productId,
      productName: product?.name || '',
      code: product?.code || '',
      quantityRemoved: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    });

    if (req.app.get('io')) {
      req.app.get('io').emit('order:updated', { sessionId: item.sessionId });
    }
    return success(res, null, 'Xóa thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
