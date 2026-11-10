import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNotificationContent,
  notificationEventSchema,
  notificationHistoryQuerySchema,
  notificationScope,
  notificationUnreadFilter,
} from "../service/notification.policy.js";

const validEvent = {
  event_id: "a0b1c2d3-e4f5-4678-9012-3456789abcde",
  payment_id: "b0b1c2d3-e4f5-4678-9012-3456789abcde",
  recipient_user_id: "c0b1c2d3-e4f5-4678-9012-3456789abcde",
  type: "payment_success",
  amount: "12500",
  currency: "INR",
};

test("validates in-app payment notification events", () => {
  assert.equal(notificationEventSchema.safeParse(validEvent).success, true);
  assert.equal(
    notificationEventSchema.safeParse({ ...validEvent, amount: "0" }).success,
    false,
  );
  assert.equal(
    notificationEventSchema.safeParse({
      ...validEvent,
      amount: "9223372036854775808",
    }).success,
    false,
  );
  assert.equal(
    notificationEventSchema.safeParse({
      ...validEvent,
      type: "payment_failed",
    }).success,
    false,
  );
});

test("formats each supported notification type without adding external channels", () => {
  assert.equal(
    buildNotificationContent(validEvent).message,
    "Your payment of INR 125.00 was successful.",
  );
  assert.equal(
    buildNotificationContent({
      ...validEvent,
      type: "payment_failed",
      failure_reason: "Insufficient balance",
    }).message,
    "Your payment of INR 125.00 failed: Insufficient balance",
  );
  assert.equal(
    buildNotificationContent({
      ...validEvent,
      type: "money_received",
    }).message,
    "You received INR 125.00.",
  );
});

test("history pagination and notification scope are validated", () => {
  assert.deepEqual(notificationScope(validEvent.recipient_user_id), {
    recipient_user_id: validEvent.recipient_user_id,
  });
  assert.equal(
    notificationHistoryQuerySchema.safeParse({ limit: "25", unread: "true" }).success,
    true,
  );
  assert.equal(
    notificationHistoryQuerySchema.safeParse({ limit: "101" }).success,
    false,
  );
  assert.deepEqual(notificationUnreadFilter("true"), { is_read: false });
  assert.deepEqual(notificationUnreadFilter("false"), { is_read: true });
  assert.deepEqual(notificationUnreadFilter(undefined), {});
});
