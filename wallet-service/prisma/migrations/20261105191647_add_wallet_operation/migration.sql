/*
  Warnings:

  - A unique constraint covering the columns `[payment_id,operation]` on the table `wallet_operation` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "wallet_operation_payment_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "wallet_operation_payment_id_operation_key" ON "wallet_operation"("payment_id", "operation");
