const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');

exports.getDailyReport = async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? new Date(date) : new Date();
    reportDate.setHours(0, 0, 0, 0);

    const report = await prisma.dailyReport.findUnique({
      where: { reportDate },
      include: { createdBy: { select: { fullName: true } } },
    });
    return success(res, report);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.generateDailyReport = async (req, res) => {
  try {
    const reportDate = new Date();
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const sessions = await prisma.session.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: reportDate, lt: nextDay } },
    });

    const data = {
      reportDate,
      totalSessions: sessions.length,
      totalRevenue: sessions.reduce((s, se) => s + se.totalAmount, 0),
      totalPlayRevenue: sessions.reduce((s, se) => s + se.totalPlayAmount, 0),
      totalFoodRevenue: sessions.reduce((s, se) => s + se.totalFoodAmount, 0),
      totalDiscount: sessions.reduce((s, se) => s + se.discountAmount, 0),
      createdById: req.user.id,
    };

    const report = await prisma.dailyReport.upsert({
      where: { reportDate },
      update: data,
      create: data,
    });
    return success(res, report, 'Tạo báo cáo cuối ngày thành công');
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getRevenueReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = { status: 'COMPLETED' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }
    const sessions = await prisma.session.findMany({ where, orderBy: { createdAt: 'desc' } });
    const summary = {
      totalSessions: sessions.length,
      totalRevenue: sessions.reduce((s, se) => s + se.totalAmount, 0),
      totalPlayRevenue: sessions.reduce((s, se) => s + se.totalPlayAmount, 0),
      totalFoodRevenue: sessions.reduce((s, se) => s + se.totalFoodAmount, 0),
      totalDiscount: sessions.reduce((s, se) => s + se.discountAmount, 0),
    };
    return success(res, { summary, sessions });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getSessionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, from, to } = req.query;
    const where = { status: 'COMPLETED' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: { room: { select: { name: true } }, staff: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.session.count({ where }),
    ]);
    return success(res, { sessions, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getSoldItemsByDay = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);

    const sessions = await prisma.session.findMany({
      where: {
        status: 'COMPLETED',
        endTime: { gte: start, lte: end },
      },
      select: {
        endTime: true,
        orderItems: {
          select: {
            quantity: true,
            totalPrice: true,
            unitPrice: true,
            product: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { endTime: 'asc' },
    });

    const byDay = {};
    sessions.forEach((session) => {
      const dayKey = new Date(session.endTime).toISOString().slice(0, 10);
      if (!byDay[dayKey]) {
        byDay[dayKey] = { date: dayKey, totalQty: 0, totalRevenue: 0, itemsMap: {} };
      }
      session.orderItems.forEach((item) => {
        const productId = item.product?.id || 'unknown';
        if (!byDay[dayKey].itemsMap[productId]) {
          byDay[dayKey].itemsMap[productId] = {
            productId,
            productName: item.product?.name || 'N/A',
            productCode: item.product?.code || '',
            quantity: 0,
            revenue: 0,
            unitPrice: item.unitPrice || 0,
          };
        }
        byDay[dayKey].itemsMap[productId].quantity += item.quantity || 0;
        byDay[dayKey].itemsMap[productId].revenue += item.totalPrice || 0;
        byDay[dayKey].totalQty += item.quantity || 0;
        byDay[dayKey].totalRevenue += item.totalPrice || 0;
      });
    });

    const daily = Object.values(byDay).map((d) => ({
      date: d.date,
      totalQty: d.totalQty,
      totalRevenue: d.totalRevenue,
      items: Object.values(d.itemsMap).sort((a, b) => b.quantity - a.quantity),
    }));

    const summaryMap = {};
    daily.forEach((day) => {
      day.items.forEach((item) => {
        if (!summaryMap[item.productId]) {
          summaryMap[item.productId] = { ...item };
          return;
        }
        summaryMap[item.productId].quantity += item.quantity;
        summaryMap[item.productId].revenue += item.revenue;
      });
    });

    const summary = Object.values(summaryMap).sort((a, b) => b.quantity - a.quantity);
    return success(res, {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      daily,
      summary,
      totals: {
        totalQty: summary.reduce((s, i) => s + i.quantity, 0),
        totalRevenue: summary.reduce((s, i) => s + i.revenue, 0),
      },
    });
  } catch (err) {
    return error(res, err.message);
  }
};
