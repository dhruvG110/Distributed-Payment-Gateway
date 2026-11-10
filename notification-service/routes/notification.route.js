import express from "express";
import { z } from "zod";
import prisma from "../db.js";
import authMiddleware from "../middleware/auth.middleware.js";
import internalAuth from "../middleware/internalAuth.js";
import { createNotification } from "../service/notification.service.js";
import {
  notificationEventSchema,
  notificationHistoryQuerySchema,
  notificationIdSchema,
  notificationScope,
  notificationUnreadFilter,
  serializeNotification,
} from "../service/notification.policy.js";

const router = express.Router();

router.post("/internal/events", internalAuth, async (req, res) => {
  const validation = notificationEventSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification event",
      errors: validation.error.issues,
    });
  }

  try {
    const notification = await createNotification(validation.data);
    return res.status(200).json({
      success: true,
      message: "Notification accepted",
      notification: serializeNotification(notification),
    });
  } catch (error) {
    console.error("Notification event creation failed:", error);
    return res.status(500).json({
      success: false,
      message: "Could not create notification",
    });
  }
});

router.get("/unread-count", authMiddleware, async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: {
        ...notificationScope(req.user.id),
        is_read: false,
      },
    });
    return res.status(200).json({ success: true, unread_count: count });
  } catch (error) {
    console.error("Unread notification count failed:", error);
    return res.status(500).json({
      success: false,
      message: "Could not fetch unread notification count",
    });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  const validation = notificationHistoryQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification history query",
      errors: validation.error.issues,
    });
  }

  try {
    const { limit, cursor, unread } = validation.data;
    const where = {
      ...notificationScope(req.user.id),
      ...notificationUnreadFilter(unread),
    };
    if (cursor) {
      // Reject deleted or foreign-user cursors explicitly instead of relying on Prisma cursor errors.
      const cursorNotification = await prisma.notification.findFirst({
        where: {
          id: cursor,
          ...notificationScope(req.user.id),
        },
        select: { id: true },
      });
      if (!cursorNotification) {
        return res.status(400).json({
          success: false,
          message: "Invalid notification cursor",
        });
      }
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = notifications.length > limit;
    const page = hasMore ? notifications.slice(0, limit) : notifications;

    return res.status(200).json({
      success: true,
      notifications: page.map(serializeNotification),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Notification history failed:", error);
    if (error.code === "P2025" && validation.data.cursor) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification cursor",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Could not fetch notifications",
    });
  }
});

router.patch("/read-all", authMiddleware, async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        ...notificationScope(req.user.id),
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });
    return res.status(200).json({
      success: true,
      message: "Notifications marked as read",
      updated_count: result.count,
    });
  } catch (error) {
    console.error("Mark all notifications as read failed:", error);
    return res.status(500).json({
      success: false,
      message: "Could not mark notifications as read",
    });
  }
});

router.patch("/:id/read", authMiddleware, async (req, res) => {
  const validation = notificationIdSchema.safeParse(req.params.id);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification ID",
    });
  }

  try {
    const scope = notificationScope(req.user.id);
    const result = await prisma.notification.updateMany({
      where: { id: validation.data, ...scope, is_read: false },
      data: { is_read: true, read_at: new Date() },
    });
    const notification = await prisma.notification.findFirst({
      where: { id: validation.data, ...scope },
    });
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: result.count === 0
        ? "Notification was already read"
        : "Notification marked as read",
      notification: serializeNotification(notification),
    });
  } catch (error) {
    console.error("Mark notification as read failed:", error);
    return res.status(500).json({
      success: false,
      message: "Could not mark notification as read",
    });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const validation = z.string().uuid().safeParse(req.params.id);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification ID",
    });
  }

  try {
    const deleted = await prisma.notification.deleteMany({
      where: {
        id: validation.data,
        ...notificationScope(req.user.id),
      },
    });
    if (deleted.count !== 1) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Delete notification failed:", error);
    return res.status(500).json({
      success: false,
      message: "Could not delete notification",
    });
  }
});

export default router;
