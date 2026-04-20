const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminPassword = await bcrypt.hash('admin123', 10);
  const managerPassword = await bcrypt.hash('manager123', 10);
  const cashierPassword = await bcrypt.hash('cashier123', 10);
  const staffPassword = await bcrypt.hash('staff123', 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: adminPassword, fullName: 'Admin Tổng', role: 'SUPER_ADMIN' },
  });
  await prisma.user.upsert({
    where: { username: 'manager' },
    update: {},
    create: { username: 'manager', password: managerPassword, fullName: 'Quản Lý', role: 'MANAGER' },
  });
  await prisma.user.upsert({
    where: { username: 'cashier1' },
    update: {},
    create: { username: 'cashier1', password: cashierPassword, fullName: 'Thu Ngân 1', role: 'CASHIER' },
  });
  await prisma.user.upsert({
    where: { username: 'staff1' },
    update: {},
    create: { username: 'staff1', password: staffPassword, fullName: 'Nhân Viên 1', role: 'STAFF' },
  });

  const takeaway = await prisma.room.upsert({
    where: { id: 'takeaway' },
    update: {},
    create: { id: 'takeaway', name: 'Mang về', type: 'TAKEAWAY', pricePerHour: 0, sortOrder: 0 },
  });

  const roomNames = [
    { name: 'VIP 1111', type: 'VIP', price: 80000 },
    { name: 'VIP 8888', type: 'VIP', price: 360000 },
    { name: 'VIP 9999', type: 'VIP', price: 80000 },
    { name: 'VIP 2222', type: 'VIP', price: 60000 },
    { name: 'VIP 5555', type: 'VIP', price: 50000 },
    { name: 'VIP 6666', type: 'VIP', price: 50000 },
    { name: 'Phòng 101', type: 'NORMAL', price: 45000 },
    { name: 'Phòng 102', type: 'NORMAL', price: 45000 },
    { name: 'Phòng 103', type: 'NORMAL', price: 40000 },
    { name: 'Phòng 104', type: 'NORMAL', price: 40000 },
    { name: 'Phòng 105', type: 'NORMAL', price: 50000 },
  ];

  for (let i = 0; i < roomNames.length; i++) {
    const r = roomNames[i];
    await prisma.room.upsert({
      where: { id: `room-${i + 1}` },
      update: {},
      create: { id: `room-${i + 1}`, name: r.name, type: r.type, pricePerHour: r.price, sortOrder: i + 1 },
    });
  }

  const catDoUong = await prisma.category.upsert({
    where: { code: 'DU' },
    update: {},
    create: { name: 'Đồ uống', code: 'DU', sortOrder: 1 },
  });
  const catDoAn = await prisma.category.upsert({
    where: { code: 'DA' },
    update: {},
    create: { name: 'Đồ ăn', code: 'DA', sortOrder: 2 },
  });
  const catBida = await prisma.category.upsert({
    where: { code: 'BD' },
    update: {},
    create: { name: 'Bida phụ kiện', code: 'BD', sortOrder: 3 },
  });

  const products = [
    { name: 'Bia Tiger', code: 'DU001', categoryId: catDoUong.id, price: 20000, stock: 100 },
    { name: 'Bia Heineken', code: 'DU002', categoryId: catDoUong.id, price: 25000, stock: 100 },
    { name: 'Coca Cola', code: 'DU003', categoryId: catDoUong.id, price: 12000, stock: 200 },
    { name: 'Pepsi', code: 'DU004', categoryId: catDoUong.id, price: 12000, stock: 200 },
    { name: 'Nước suối', code: 'DU005', categoryId: catDoUong.id, price: 8000, stock: 300 },
    { name: 'Trà đá', code: 'DU006', categoryId: catDoUong.id, price: 5000, stock: 0 },
    { name: 'Cà phê sữa', code: 'DU007', categoryId: catDoUong.id, price: 18000, stock: 0 },
    { name: 'Red Bull', code: 'DU008', categoryId: catDoUong.id, price: 15000, stock: 50 },
    { name: 'Bánh mì thịt', code: 'DA001', categoryId: catDoAn.id, price: 25000, stock: 20 },
    { name: 'Mì tôm', code: 'DA002', categoryId: catDoAn.id, price: 20000, stock: 30 },
    { name: 'Khô bò', code: 'DA003', categoryId: catDoAn.id, price: 35000, stock: 15 },
    { name: 'Đậu phộng', code: 'DA004', categoryId: catDoAn.id, price: 15000, stock: 40 },
    { name: 'Bida cue chalk', code: 'BD001', categoryId: catBida.id, price: 10000, stock: 50 },
    { name: 'Bida tip', code: 'BD002', categoryId: catBida.id, price: 15000, stock: 30 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }

  await prisma.setting.upsert({ where: { key: 'storeName' }, update: { value: 'KARAOKE LASVEGAS 434' }, create: { key: 'storeName', value: 'KARAOKE LASVEGAS 434' } });
  await prisma.setting.upsert({ where: { key: 'storeAddress' }, update: {}, create: { key: 'storeAddress', value: '' } });
  await prisma.setting.upsert({ where: { key: 'storePhone' }, update: {}, create: { key: 'storePhone', value: '' } });
  await prisma.setting.upsert({ where: { key: 'stockManagementEnabled' }, update: {}, create: { key: 'stockManagementEnabled', value: 'true' } });

  console.log('Seed completed!');
  console.log('Accounts: admin/admin123, manager/manager123, cashier1/cashier123, staff1/staff123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
