const prisma = require('../../config/database');
const { success, error } = require('../../utils/response');

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** @returns {{ rangeStart: Date, rangeEnd: Date, preset: string }} */
function getRangeFromQuery(query) {
  const preset = (query.preset || 'today').toLowerCase();
  const now = new Date();
  let rangeStart;
  let rangeEnd;

  if (preset === 'custom' && query.from && query.to) {
    rangeStart = startOfDay(new Date(query.from));
    rangeEnd = endOfDay(new Date(query.to));
  } else if (preset === 'week') {
    const d = new Date(now);
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    rangeStart = startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset));
    rangeEnd = endOfDay(now);
  } else if (preset === 'month') {
    rangeStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    rangeEnd = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else if (preset === 'year') {
    rangeStart = startOfDay(new Date(now.getFullYear(), 0, 1));
    rangeEnd = endOfDay(new Date(now.getFullYear(), 11, 31));
  } else {
    rangeStart = startOfDay(now);
    rangeEnd = endOfDay(now);
  }

  if (rangeStart > rangeEnd) {
    const t = rangeStart;
    rangeStart = rangeEnd;
    rangeEnd = t;
  }

  return { rangeStart, rangeEnd, preset: preset === 'custom' ? 'custom' : preset };
}

function getComparisonRange(preset, rangeStart, rangeEnd) {
  if (preset === 'today') {
    const y = new Date(rangeStart);
    y.setDate(y.getDate() - 1);
    return { prevRangeStart: startOfDay(y), prevRangeEnd: endOfDay(y) };
  }
  if (preset === 'week') {
    const prevWeekEnd = new Date(rangeStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekStart.getDate() - 6);
    return { prevRangeStart: startOfDay(prevWeekStart), prevRangeEnd: endOfDay(prevWeekEnd) };
  }
  if (preset === 'month') {
    const lastDayPrev = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 0);
    return {
      prevRangeStart: startOfDay(new Date(lastDayPrev.getFullYear(), lastDayPrev.getMonth(), 1)),
      prevRangeEnd: endOfDay(lastDayPrev),
    };
  }
  if (preset === 'year') {
    const y = rangeStart.getFullYear() - 1;
    return { prevRangeStart: startOfDay(new Date(y, 0, 1)), prevRangeEnd: endOfDay(new Date(y, 11, 31)) };
  }
  const len = rangeEnd.getTime() - rangeStart.getTime();
  const prevRangeEnd = new Date(rangeStart.getTime() - 86400000);
  prevRangeEnd.setHours(23, 59, 59, 999);
  const prevRangeStart = new Date(prevRangeEnd.getTime() - len);
  prevRangeStart.setHours(0, 0, 0, 0);
  return { prevRangeStart, prevRangeEnd };
}

function resolveBucket(rangeStart, rangeEnd, bucketParam) {
  if (bucketParam && bucketParam !== 'auto') return bucketParam;
  const days = Math.max(1, (rangeEnd - rangeStart) / 86400000);
  if (days <= 2) return 'hour';
  if (days <= 24) return 'day';
  if (days <= 100) return 'week';
  return 'month';
}

function getGroupMeta(date, bucket) {
  const d = new Date(date);
  if (bucket === 'hour') {
    const h = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
    return {
      key: `${h.getFullYear()}-${pad(h.getMonth() + 1)}-${pad(h.getDate())}T${pad(h.getHours())}`,
      label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:00`,
      sortKey: h.getTime(),
    };
  }
  if (bucket === 'day') {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return {
      key: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
      label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
      sortKey: day.getTime(),
    };
  }
  if (bucket === 'week') {
    const dayOf = d.getDay();
    const mondayOffset = dayOf === 0 ? -6 : 1 - dayOf;
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset);
    mon.setHours(0, 0, 0, 0);
    return {
      key: `w-${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`,
      label: `Tuần ${pad(mon.getDate())}/${pad(mon.getMonth() + 1)}`,
      sortKey: mon.getTime(),
    };
  }
  const m = new Date(d.getFullYear(), d.getMonth(), 1);
  return {
    key: `m-${m.getFullYear()}-${pad(m.getMonth() + 1)}`,
    label: `${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    sortKey: m.getTime(),
  };
}

exports.getStats = async (req, res) => {
  try {
    const { rangeStart, rangeEnd, preset } = getRangeFromQuery(req.query);
    const { prevRangeStart, prevRangeEnd } = getComparisonRange(preset, rangeStart, rangeEnd);

    const [
      totalRooms,
      roomsInUse,
      customersServing,
      periodSessionsCount,
      periodCompletedRows,
      prevCompletedRows,
    ] = await Promise.all([
      prisma.room.count(),
      prisma.room.count({ where: { status: 'IN_USE' } }),
      prisma.session.count({ where: { status: 'ACTIVE' } }),
      prisma.session.count({ where: { createdAt: { gte: rangeStart, lte: rangeEnd } } }),
      prisma.session.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: rangeStart, lte: rangeEnd } },
        select: { totalAmount: true, totalPlayAmount: true, totalFoodAmount: true, discountAmount: true },
      }),
      prisma.session.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: prevRangeStart, lte: prevRangeEnd } },
        select: { totalAmount: true },
      }),
    ]);

    const periodRevenue = periodCompletedRows.reduce((sum, s) => sum + s.totalAmount, 0);
    const periodPlayRevenue = periodCompletedRows.reduce((sum, s) => sum + s.totalPlayAmount, 0);
    const periodFoodRevenue = periodCompletedRows.reduce((sum, s) => sum + s.totalFoodAmount, 0);
    const periodDiscount = periodCompletedRows.reduce((sum, s) => sum + s.discountAmount, 0);
    const prevRevenue = prevCompletedRows.reduce((sum, s) => sum + s.totalAmount, 0);
    const revenueDeltaPct = prevRevenue > 0 ? Math.round(((periodRevenue - prevRevenue) / prevRevenue) * 1000) / 10 : null;

    return success(res, {
      range: {
        preset,
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
        labelVi: formatRangeLabelVi(rangeStart, rangeEnd, preset),
      },
      comparisonRange: {
        start: prevRangeStart.toISOString(),
        end: prevRangeEnd.toISOString(),
        labelVi: formatRangeLabelVi(prevRangeStart, prevRangeEnd, 'custom'),
      },
      totalRooms,
      roomsInUse,
      customersServing,
      periodSessionsCount,
      periodCompletedSessions: periodCompletedRows.length,
      periodRevenue,
      periodPlayRevenue,
      periodFoodRevenue,
      periodDiscount,
      avgOrderValue: periodCompletedRows.length > 0 ? Math.round(periodRevenue / periodCompletedRows.length) : 0,
      comparison: {
        prevPeriodRevenue: prevRevenue,
        revenueDeltaPercent: revenueDeltaPct,
      },
    });
  } catch (err) {
    return error(res, err.message);
  }
};

function formatRangeLabelVi(a, b, preset) {
  const opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const ta = a.toLocaleDateString('vi-VN', opts);
  const tb = b.toLocaleDateString('vi-VN', opts);
  if (ta === tb) return ta;
  if (preset === 'today') return ta;
  return `${ta} – ${tb}`;
}

exports.getRevenueChart = async (req, res) => {
  try {
    const { rangeStart, rangeEnd, preset } = getRangeFromQuery(req.query);
    const bucket = resolveBucket(rangeStart, rangeEnd, req.query.bucket);

    const sessions = await prisma.session.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: { createdAt: true, totalAmount: true, totalPlayAmount: true, totalFoodAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    const chartData = {};
    sessions.forEach((s) => {
      const { key, label, sortKey } = getGroupMeta(s.createdAt, bucket);
      if (!chartData[key]) chartData[key] = { label, sortKey, total: 0, play: 0, food: 0 };
      chartData[key].total += s.totalAmount;
      chartData[key].play += s.totalPlayAmount;
      chartData[key].food += s.totalFoodAmount;
    });

    const chart = Object.values(chartData)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ sortKey, ...rest }) => rest);

    return success(res, {
      chart,
      bucket,
      range: { preset, start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getTopProducts = async (req, res) => {
  try {
    const { rangeStart, rangeEnd } = getRangeFromQuery(req.query);
    const completed = await prisma.session.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { id: true },
    });
    const sessionIds = completed.map((s) => s.id);
    if (sessionIds.length === 0) return success(res, []);

    const items = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { sessionId: { in: sessionIds } },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
    });
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const result = items.map((i) => {
      const p = products.find((pr) => pr.id === i.productId);
      return { productId: i.productId, name: p?.name || 'N/A', totalQuantity: i._sum.quantity ?? 0, totalRevenue: i._sum.totalPrice ?? 0 };
    });
    return success(res, result);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getRecentSessions = async (req, res) => {
  try {
    const { rangeStart, rangeEnd } = getRangeFromQuery(req.query);
    const limit = Math.min(Number(req.query.limit) || 30, 200);
    const sessions = await prisma.session.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { name: true } },
        staff: { select: { fullName: true } },
      },
    });
    return success(res, sessions);
  } catch (err) {
    return error(res, err.message);
  }
};
