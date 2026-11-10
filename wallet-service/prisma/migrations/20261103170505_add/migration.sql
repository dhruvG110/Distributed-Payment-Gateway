-- CreateEnum
CREATE TYPE "wallet_event_type" AS ENUM ('created', 'freeze', 'unfreeze');

-- CreateTable
CREATE TABLE "wallet_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id" UUID NOT NULL,
    "event_type" "wallet_event_type" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_event_wallet_id_created_at_idx" ON "wallet_event"("wallet_id", "created_at");

-- AddForeignKey
ALTER TABLE "wallet_event" ADD CONSTRAINT "wallet_event_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
