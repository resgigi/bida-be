const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { logAction } = require('../../utils/audit');

async function defaultTrackStockFromSetting() {
  const setting = await prisma.setting.findUnique({ where: { key: 'stockManagementEnabled' } });
  if (!setting) return true;
  return String(setting.value).toLowerCase() === 'true';
}

async function attachTotalSold(products) {
  if (!products || products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const sums = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { productId: { in: ids } },
    _sum: { quantity: true },
  });
  const map = new Map(sums.map((s) => [s.productId, s._sum.quantity || 0]));
  return products.map((p) => ({ ...p, totalSold: map.get(p.id) || 0 }));
}

exports.getCategories = async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: true } } } });
    return success(res, categories);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, code, sortOrder } = req.body;
    const cat = await prisma.category.create({ data: { name, code, sortOrder: sortOrder || 0 } });
    return success(res, cat, 'Tạo danh mục thành công', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    return success(res, cat, 'Cập nhật danh mục thành công');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    return success(res, null, 'Xóa danh mục thành công');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getAll = async (req, res) => {
  try {
    const { categoryId, search, isActive } = req.query;
    const where = {};
    if (categoryId) where.categoryId = categoryId;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }
    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    const withSold = await attachTotalSold(products);
    return success(res, withSold);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getById = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { category: true } });
    if (!product) return error(res, 'Sản phẩm không tồn tại', 404);
    const [withSold] = await attachTotalSold([product]);
    return success(res, withSold);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.create = async (req, res) => {
  try {
    const {
      name, code, categoryId, price, stock, imageUrl, isActive, trackStock: bodyTrack,
    } = req.body;

    let trackStock = bodyTrack;
    if (trackStock === undefined || trackStock === null) {
      trackStock = await defaultTrackStockFromSetting();
    } else {
      trackStock = Boolean(trackStock);
    }
    const stockVal = trackStock ? Math.max(0, Number(stock) || 0) : 0;

    const product = await prisma.product.create({
      data: {
        name,
        code,
        categoryId,
        price: Number(price),
        stock: stockVal,
        trackStock,
        imageUrl: imageUrl || '',
        isActive: isActive !== false,
      },
      include: { category: true },
    });
    await logAction(req.user.id, 'CREATE', 'Product', product.id, { name, trackStock });
    const [withSold] = await attachTotalSold([product]);
    return success(res, withSold, 'Tạo sản phẩm thành công', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.update = async (req, res) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return error(res, 'Sản phẩm không tồn tại', 404);

    const allowed = ['name', 'code', 'categoryId', 'price', 'stock', 'imageUrl', 'isActive', 'trackStock'];
    const data = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) data[k] = req.body[k];
    }
    if (data.price !== undefined) data.price = Number(data.price);
    if (data.stock !== undefined) data.stock = Math.max(0, Number(data.stock) || 0);

    const nextTrack = Object.prototype.hasOwnProperty.call(data, 'trackStock')
      ? Boolean(data.trackStock)
      : existing.trackStock;

    if (!nextTrack) {
      data.trackStock = false;
      data.stock = 0;
    } else if (Object.prototype.hasOwnProperty.call(data, 'trackStock')) {
      data.trackStock = true;
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: { category: true },
    });
    await logAction(req.user.id, 'UPDATE', 'Product', product.id, data);
    const [withSold] = await attachTotalSold([product]);
    return success(res, withSold, 'Cập nhật sản phẩm thành công');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.remove = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return error(res, 'Sản phẩm không tồn tại', 404);
    await prisma.product.delete({ where: { id: req.params.id } });
    await logAction(req.user.id, 'DELETE', 'Product', req.params.id, { name: product.name });
    return success(res, null, 'Xóa sản phẩm thành công');
  } catch (err) {
    return error(res, err.message);
  }
};
