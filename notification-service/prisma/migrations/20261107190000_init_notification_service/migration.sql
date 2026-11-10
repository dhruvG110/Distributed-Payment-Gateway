-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('payment_success', 'payment_failed', 'money_received');

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_recipient_user_id_created_at_idx" ON "notification"("recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_recipient_user_id_is_read_idx" ON "notification"("recipient_user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipient_user_id_event_id_type_key" ON "notification"("recipient_user_id", "event_id", "type");
