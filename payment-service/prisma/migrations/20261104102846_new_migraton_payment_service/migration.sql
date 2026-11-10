-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'reversed');

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sender_wallet_id" UUID NOT NULL,
    "receiver_wallet_id" UUID NOT NULL,
    "initiated_by" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_sender_wallet_id_idx" ON "payment"("sender_wallet_id");

-- CreateIndex
CREATE INDEX "payment_receiver_wallet_id_idx" ON "payment"("receiver_wallet_id");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE INDEX "payment_created_at_idx" ON "payment"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_initiated_by_idempotency_key_key" ON "payment"("initiated_by", "idempotency_key");
