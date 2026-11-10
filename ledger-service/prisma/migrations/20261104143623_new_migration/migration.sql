-- CreateEnum
CREATE TYPE "entry_type" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "ledger_status" AS ENUM ('posted', 'reversed');

-- CreateTable
CREATE TABLE "ledger_transaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "ledger_status" NOT NULL DEFAULT 'posted',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "entry_type" "entry_type" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transaction_payment_id_key" ON "ledger_transaction"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transaction_reference_key" ON "ledger_transaction"("reference");

-- CreateIndex
CREATE INDEX "ledger_transaction_created_at_idx" ON "ledger_transaction"("created_at");

-- CreateIndex
CREATE INDEX "ledger_entry_wallet_id_created_at_idx" ON "ledger_entry"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entry_transaction_id_idx" ON "ledger_entry"("transaction_id");

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
