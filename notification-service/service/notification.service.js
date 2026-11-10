import prisma from "../db.js";
import { buildNotificationContent } from "./notification.policy.js";

export const createNotification = async (event) => {
  const content = buildNotificationContent(event);
  return prisma.notification.upsert({
    where: {
      recipient_user_id_event_id_type: {
        recipient_user_id: event.recipient_user_id,
        event_id: event.event_id,
        type: event.type,
      },
    },
    create: {
      recipient_user_id: event.recipient_user_id,
      event_id: event.event_id,
      payment_id: event.payment_id,
      type: event.type,
      ...content,
    },
    update: {},
  });
};
