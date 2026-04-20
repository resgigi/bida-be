const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');

async function isStockManagementEnabled() {
  const setting = await prisma.setting.findUnique({ where: { key: 'stockManagementEnabled' } });
  if (!setting) return true;
  return String(setting.value).toLowerCase() === 'true';
}

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
    const stockManaged = await isStockManagementEnabled();
    if (stockManaged && product.stock < quantity) return error(res, 'Không đủ tồn kho', 400);

    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderItem.findFirst({ where: { sessionId, productId } });
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
    const session = await prisma.session.findUnique({ where: { id: item.sessionId } });
    if (!session || session.status !== 'ACTIVE') return error(res, 'Phiên không hợp lệ', 400);

    const delta = quantity - item.quantity;
    const stockManaged = await isStockManagementEnabled();
    if (stockManaged && delta > 0) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
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
    const item = await prisma.orderItem.findUnique({ where: { id: req.params.id } });
    if (!item) return error(res, 'Không tìm thấy', 404);
    const stockManaged = await isStockManagementEnabled();

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

    if (req.app.get('io')) {
      req.app.get('io').emit('order:updated', { sessionId: item.sessionId });
    }
    return success(res, null, 'Xóa thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
