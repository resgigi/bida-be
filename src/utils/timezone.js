const prisma = require('../config/database');

const VIETNAM_UTC_OFFSET = 7;
const DAY_START_HOUR_KEY = 'day_start_hour';
const DEFAULT_DAY_START_HOUR = 7;

async function getDayStartHour() {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: DAY_START_HOUR_KEY }
    });
    return setting ? parseInt(setting.value, 10) : DEFAULT_DAY_START_HOUR;
  } catch {
    return DEFAULT_DAY_START_HOUR;
  }
}

async function setDayStartHour(hour) {
  if (hour !== 5 && hour !== 7) {
    throw new Error('Day start hour must be 5 or 7');
  }
  return prisma.setting.upsert({
    where: { key: DAY_START_HOUR_KEY },
    update: { value: String(hour) },
    create: { key: DAY_START_HOUR_KEY, value: String(hour) }
  });
}

function toUTC(localDate) {
  const d = new Date(localDate);
  d.setHours(d.getHours() - VIETNAM_UTC_OFFSET);
  return d;
}

function toLocalVN(utcDate) {
  const d = new Date(utcDate);
  d.setHours(d.getHours() + VIETNAM_UTC_OFFSET);
  return d;
}

function startOfDayVN(date, dayStartHour = 7) {
  const localDate = toLocalVN(new Date(date));
  localDate.setHours(dayStartHour, 0, 0, 0);
  return toUTC(localDate);
}

function endOfDayVN(date, dayStartHour = 7) {
  const localDate = toLocalVN(new Date(date));
  localDate.setDate(localDate.getDate() + 1);
  localDate.setHours(dayStartHour, 0, 0, 0);
  return toUTC(localDate);
}

function startOfDayLocal(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDayLocal(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

exports.VIETNAM_UTC_OFFSET = VIETNAM_UTC_OFFSET;
exports.getDayStartHour = getDayStartHour;
exports.setDayStartHour = setDayStartHour;
exports.toLocalVN = toLocalVN;
exports.toUTC = toUTC;
exports.startOfDayVN = startOfDayVN;
exports.endOfDayVN = endOfDayVN;
exports.startOfDayLocal = startOfDayLocal;
exports.endOfDayLocal = endOfDayLocal;

async function getRangeFromQueryWithTZ(query) {
  const preset = (query.preset || 'today').toLowerCase();
  const now = new Date();
  const dayStartHour = await getDayStartHour();

  let rangeStart;
  let rangeEnd;

  if (preset === 'custom' && query.from && query.to) {
    rangeStart = startOfDayVN(new Date(query.from), dayStartHour);
    rangeEnd = endOfDayVN(new Date(query.to), dayStartHour);
  } else if (preset === 'week') {
    const localNow = toLocalVN(now);
    const day = localNow.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(localNow);
    monday.setDate(monday.getDate() + mondayOffset);
    rangeStart = startOfDayVN(monday, dayStartHour);
    rangeEnd = endOfDayVN(now, dayStartHour);
  } else if (preset === 'month') {
    const localNow = toLocalVN(now);
    const firstDay = new Date(localNow.getFullYear(), localNow.getMonth(), 1);
    rangeStart = startOfDayVN(firstDay, dayStartHour);
    const lastDay = new Date(localNow.getFullYear(), localNow.getMonth() + 1, 0);
    rangeEnd = endOfDayVN(lastDay, dayStartHour);
  } else if (preset === 'year') {
    const localNow = toLocalVN(now);
    const firstDay = new Date(localNow.getFullYear(), 0, 1);
    const lastDay = new Date(localNow.getFullYear(), 11, 31);
    rangeStart = startOfDayVN(firstDay, dayStartHour);
    rangeEnd = endOfDayVN(lastDay, dayStartHour);
  } else {
    rangeStart = startOfDayVN(now, dayStartHour);
    rangeEnd = endOfDayVN(now, dayStartHour);
  }

  if (rangeStart > rangeEnd) {
    const t = rangeStart;
    rangeStart = rangeEnd;
    rangeEnd = t;
  }

  return { rangeStart, rangeEnd, preset: preset === 'custom' ? 'custom' : preset, dayStartHour };
}

exports.getRangeFromQueryWithTZ = getRangeFromQueryWithTZ;
