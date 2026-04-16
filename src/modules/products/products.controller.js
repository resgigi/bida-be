const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');
const { logAction } = require('../../utils/audit');

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
    return success(res, products);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getById = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { category: true } });
    if (!product) return error(res, 'Sản phẩm không tồn tại', 404);
    return success(res, product);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.create = async (req, res) => {
  try {
    const { name, code, categoryId, price, stock, imageUrl, isActive } = req.body;
    const product = await prisma.product.create({
      data: { name, code, categoryId, price, stock: stock || 0, imageUrl: imageUrl || '', isActive: isActive !== false },
      include: { category: true },
    });
    await logAction(req.user.id, 'CREATE', 'Product', product.id, { name });
    return success(res, product, 'Tạo sản phẩm thành công', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.update = async (req, res) => {
  try {
    const product = await prisma.product.update({ where: { id: req.params.id }, data: req.body, include: { category: true } });
    await logAction(req.user.id, 'UPDATE', 'Product', product.id, req.body);
    return success(res, product, 'Cập nhật sản phẩm thành công');
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
