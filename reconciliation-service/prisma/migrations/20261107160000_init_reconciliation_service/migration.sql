-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "reconciliation_run_status" AS ENUM ('running', 'completed', 'completed_with_errors', 'failed');

-- CreateEnum
CREATE TYPE "reconciliation_record_status" AS ENUM ('matched', 'mismatched', 'incomplete', 'needs_review');

-- CreateTable
CREATE TABLE "reconciliation_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "reconciliation_run_status" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "total_checked" INTEGER NOT NULL DEFAULT 0,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "mismatched_count" INTEGER NOT NULL DEFAULT 0,
    "incomplete_count" INTEGER NOT NULL DEFAULT 0,
    "needs_review_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "status" "reconciliation_record_status" NOT NULL,
    "expected_amount" BIGINT,
    "wallet_debit" BIGINT,
    "wallet_credit" BIGINT,
    "ledger_debit" BIGINT,
    "ledger_credit" BIGINT,
    "mismatch_reason" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_run_status_started_at_idx" ON "reconciliation_run"("status", "started_at");

-- CreateIndex
CREATE INDEX "reconciliation_run_created_at_idx" ON "reconciliation_run"("created_at");

-- CreateIndex
CREATE INDEX "reconciliation_record_payment_id_created_at_idx" ON "reconciliation_record"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "reconciliation_record_run_id_status_idx" ON "reconciliation_record"("run_id", "status");

-- CreateIndex
CREATE INDEX "reconciliation_record_status_created_at_idx" ON "reconciliation_record"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_record_run_id_payment_id_key" ON "reconciliation_record"("run_id", "payment_id");

-- AddForeignKey
ALTER TABLE "reconciliation_record" ADD CONSTRAINT "reconciliation_record_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "reconciliation_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
