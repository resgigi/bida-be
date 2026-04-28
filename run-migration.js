/**
 * Script chạy SQL migration trực tiếp từ Node.js
 * Không cần psql client - dùng thư viện pg của Node
 * 
 * Cách dùng:
 *   node run-migration.js
 */

const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

async function runMigration() {
  console.log('🔄 Đang kết nối database...');
  
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Kết nối thành công!');

    // Chạy migration
    console.log('📝 Đang thêm columns...');
    
    await client.query(`
      ALTER TABLE "Session" 
      ADD COLUMN IF NOT EXISTS "isPaused" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ✅ Thêm column "isPaused"');

    await client.query(`
      ALTER TABLE "Session" 
      ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
    `);
    console.log('  ✅ Thêm column "pausedAt"');

    await client.query(`
      ALTER TABLE "Session" 
      ADD COLUMN IF NOT EXISTS "pausedDuration" INTEGER NOT NULL DEFAULT 0;
    `);
    console.log('  ✅ Thêm column "pausedDuration"');

    // Verify
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Session' 
      AND column_name IN ('isPaused', 'pausedAt', 'pausedDuration')
      ORDER BY column_name;
    `);
    
    console.log('\n📋 Các columns đã thêm:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n🎉 Migration hoàn tất!');

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
