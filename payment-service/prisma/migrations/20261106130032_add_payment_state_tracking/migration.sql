-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "current_step" VARCHAR(30),
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "next_retry_at" TIMESTAMPTZ(6),
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0;
