-- CreateTable
CREATE TABLE "wallet_operation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'reserved',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_operation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_operation_payment_id_key" ON "wallet_operation"("payment_id");

-- CreateIndex
CREATE INDEX "wallet_operation_wallet_id_created_at_idx" ON "wallet_operation"("wallet_id", "created_at");
