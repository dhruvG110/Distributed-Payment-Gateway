-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "locked_by" VARCHAR(100),
ADD COLUMN     "locked_until" TIMESTAMPTZ(6);
