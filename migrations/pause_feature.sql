-- Migration SQL để thêm columns mới vào bảng Session
-- Chạy lệnh này trên PostgreSQL của bạn (Render dashboard hoặc psql)

-- Thêm columns mới với giá trị mặc định (không ảnh hưởng data cũ)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "isPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "pausedDuration" INTEGER NOT NULL DEFAULT 0;

-- Kiểm tra đã thêm thành công
SELECT id, "isPaused", "pausedDuration", "pausedAt" FROM "Session" LIMIT 5;

-- Nếu muốn rollback (xóa columns)
-- ALTER TABLE "Session" DROP COLUMN IF EXISTS "isPaused";
-- ALTER TABLE "Session" DROP COLUMN IF EXISTS "pausedAt";
-- ALTER TABLE "Session" DROP COLUMN IF EXISTS "pausedDuration";
