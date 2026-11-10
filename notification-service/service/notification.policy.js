import { z } from "zod";

const MAX_POSTGRES_BIGINT = "9223372036854775807";
const positiveIntegerString = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine(
    (value) =>
      value.length < MAX_POSTGRES_BIGINT.length ||
      (value.length === MAX_POSTGRES_BIGINT.length &&
        value <= MAX_POSTGRES_BIGINT),
    "Amount exceeds the supported integer range",
  );

export const notificationEventSchema = z
  .object({
    event_id: z.string().uuid(),
    payment_id: z.string().uuid(),
    recipient_user_id: z.string().uuid(),
    type: z.enum(["payment_success", "payment_failed", "money_received"]),
    amount: positiveIntegerString,
    currency: z.string().regex(/^[A-Z]{3}$/),
    failure_reason: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.type === "payment_failed" && !event.failure_reason) {
      context.addIssue({
        code: "custom",
        path: ["failure_reason"],
        message: "Failure reason is required for payment_failed events",
      });
    }
    if (event.type !== "payment_failed" && event.failure_reason !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["failure_reason"],
        message: "Failure reason is only valid for payment_failed events",
      });
    }
  });

export const notificationHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().uuid().optional(),
    unread: z.enum(["true", "false"]).optional(),
  })
  .strict();

export const notificationIdSchema = z.string().uuid();

export const notificationScope = (recipientUserId) => ({
  recipient_user_id: recipientUserId,
});

export const notificationUnreadFilter = (unread) =>
  unread === undefined ? {} : { is_read: unread === "false" };

const formatMinorAmount = (amount, currency) => {
  const minorUnits = BigInt(amount);
  if (currency === "INR") {
    const rupees = minorUnits / 100n;
    const paise = (minorUnits % 100n).toString().padStart(2, "0");
    return `INR ${rupees}.${paise}`;
  }
  return `${amount} minor units ${currency}`;
};

export const buildNotificationContent = (event) => {
  const amountText = formatMinorAmount(event.amount, event.currency);
  const content = {
    payment_success: {
      title: "Payment successful",
      message: `Your payment of ${amountText} was successful.`,
    },
    payment_failed: {
      title: "Payment failed",
      message: `Your payment of ${amountText} failed: ${event.failure_reason}`,
    },
    money_received: {
      title: "Money received",
      message: `You received ${amountText}.`,
    },
  }[event.type];

  return {
    ...content,
    data: {
      payment_id: event.payment_id,
      amount: event.amount,
      currency: event.currency,
    },
  };
};

export const serializeNotification = (notification) => ({
  id: notification.id,
  payment_id: notification.payment_id,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  data: notification.data,
  is_read: notification.is_read,
  read_at: notification.read_at,
  created_at: notification.created_at,
});
