import express from "express";
import { z } from "zod";
import prisma from "../db.js";
import authMiddleware from "../middleware/auth.middleware.js";
import internalAuth from "../middleware/internalAuth.js";
import { processPayment } from "../service/payment-orchestrator.js";
// import {
//   createPaymentLockOwner,
//   paymentLockDurationMs,
//   releasePaymentLock,
//   renewPaymentLock,
// } from "../service/paymentLock.js";
// import { canCancelWithoutWalletRelease } from "../service/paymentSafety.js";

const router = express.Router();

const paymentSchema = z
  .object({
    sender_wallet_id: z.string().uuid(),
    receiver_wallet_id: z.string().uuid(),
    amount: z.coerce.bigint().positive(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/)
      .default("INR"),
  })
  .strict();
const paymentIdSchema = z.string().uuid();
const paymentHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: paymentIdSchema.optional(),
  })
  .strict();

const serializePayment = (payment) => ({
  id: payment.id,
  sender_wallet_id: payment.sender_wallet_id,
  receiver_wallet_id: payment.receiver_wallet_id,
  amount: payment.amount.toString(),
  currency: payment.currency,
  status: payment.status,
  failure_reason: payment.failure_reason,
  created_at: payment.created_at,
  updated_at: payment.updated_at,
});

const matchesPaymentRequest = (payment, request) =>
  payment.sender_wallet_id === request.sender_wallet_id &&
  payment.receiver_wallet_id === request.receiver_wallet_id &&
  payment.amount === request.amount &&
  payment.currency === request.currency;

const respondWithExistingPayment = (res, payment, request) => {
  if (!matchesPaymentRequest(payment, request)) {
    return res.status(409).json({
      success: false,
      message: "Idempotency key reused with different payment data",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Existing payment returned",
    payment: {
      ...payment,
      amount: payment.amount.toString(),
    },
  });
};

// USER PAYMENT HISTORY
router.get("/", authMiddleware, async (req, res) => {
  try {
    const validation = paymentHistoryQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment history query",
        errors: validation.error.issues,
      });
    }

    const { limit, cursor } = validation.data;
    const payments = await prisma.payment.findMany({
      where: { initiated_by: req.user.id },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = payments.length > limit;
    const page = hasMore ? payments.slice(0, limit) : payments;

    return res.status(200).json({
      success: true,
      payments: page.map(serializePayment),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Payment History Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// PAYMENT DETAILS
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const validation = paymentIdSchema.safeParse(req.params.id);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID",
      });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        id: validation.data,
        initiated_by: req.user.id,
      },
    });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment: serializePayment(payment),
    });
  } catch (error) {
    console.error("Payment Fetch Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// CREATE PAYMENT
router.post("/", authMiddleware, async (req, res) => {
  try {
    const validation = paymentSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment data",
        errors: validation.error.issues,
      });
    }

    const request = validation.data;
    const { sender_wallet_id, receiver_wallet_id, amount, currency } = request;

    const idempotencyKey = req.headers["idempotency-key"];

    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 255
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid Idempotency-Key header is required",
      });
    }

    if (sender_wallet_id === receiver_wallet_id) {
      return res.status(400).json({
        success: false,
        message: "Sender and receiver cannot be the same",
      });
    }

    const initiated_by = req.user.id;

    const existingPayment = await prisma.payment.findUnique({
      where: {
        initiated_by_idempotency_key: {
          initiated_by,
          idempotency_key: idempotencyKey,
        },
      },
    });

    if (existingPayment) {
      return respondWithExistingPayment(res, existingPayment, request);
    }

    let payment;
    try {
      payment = await prisma.payment.create({
        data: {
          sender_wallet_id,
          receiver_wallet_id,
          initiated_by,
          amount,
          currency,
          idempotency_key: idempotencyKey,
          status: "pending",
        },
      });
    } catch (error) {
      if (error.code !== "P2002") {
        throw error;
      }

      const concurrentPayment = await prisma.payment.findUnique({
        where: {
          initiated_by_idempotency_key: {
            initiated_by,
            idempotency_key: idempotencyKey,
          },
        },
      });
      if (!concurrentPayment) {
        throw error;
      }

      return respondWithExistingPayment(res, concurrentPayment, request);
    }

    const result = await processPayment({
      id: payment.id,
      sender_wallet_id: payment.sender_wallet_id,
      receiver_wallet_id: payment.receiver_wallet_id,
      amount: payment.amount,
      currency: payment.currency,
    });

    return res.status(result.success ? 200 : result.statusCode || 500).json(result);
  } catch (error) {
    console.error("Payment Creation Error:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Payment request already exists. Retry with the same key.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Cancellation is limited to steps before reserve is recorded; later steps may have moved money.
router.post("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const validation = paymentIdSchema.safeParse(req.params.id);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID",
      });
    }

    const paymentId = validation.data;
    const userId = req.user.id;
    const pendingCancellation = await prisma.payment.updateMany({
      where: {
        id: paymentId,
        initiated_by: userId,
        status: "pending",
      },
      data: {
        status: "cancelled",
        failure_reason: "Cancelled by user",
        next_retry_at: null,
      },
    });

    if (pendingCancellation.count === 1) {
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      return res.status(200).json({
        success: true,
        message: "Payment cancelled",
        payment: serializePayment(payment),
      });
    }

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, initiated_by: userId },
    });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }
    if (payment.status === "cancelled") {
      return res.status(200).json({
        success: true,
        message: "Payment was already cancelled",
        payment: serializePayment(payment),
      });
    }
    if (payment.status !== "processing") {
      return res.status(409).json({
        success: false,
        message: `Payment cannot be cancelled from ${payment.status} status`,
        payment: serializePayment(payment),
      });
    }

    const now = new Date();
    if (payment.locked_until && payment.locked_until > now) {
      return res.status(409).json({
        success: false,
        message: "Payment is actively processing and cannot be cancelled yet",
        payment: serializePayment(payment),
      });
    }

    const cancellationOwner = createPaymentLockOwner("cancel");
    const claimed = await prisma.payment.updateMany({
      where: {
        id: paymentId,
        initiated_by: userId,
        status: "processing",
        OR: [{ locked_until: null }, { locked_until: { lte: now } }],
      },
      data: {
        locked_by: cancellationOwner,
        locked_until: new Date(now.getTime() + paymentLockDurationMs),
      },
    });
    if (claimed.count !== 1) {
      return res.status(409).json({
        success: false,
        message: "Payment processing state changed; try again",
      });
    }

    try {
      const claimedPayment = await prisma.payment.findFirst({
        where: {
          id: paymentId,
          initiated_by: userId,
          status: "processing",
          locked_by: cancellationOwner,
        },
      });

      // The reserve step is persisted before its request, so even reserve may be in flight.
      if (!claimedPayment || !canCancelWithoutWalletRelease(claimedPayment.current_step)) {
        return res.status(409).json({
          success: false,
          message: "Payment may have started wallet or ledger operations and cannot be cancelled",
          payment: claimedPayment ? serializePayment(claimedPayment) : undefined,
        });
      }

      if (!(await renewPaymentLock(paymentId, cancellationOwner))) {
        return res.status(409).json({
          success: false,
          message: "Cancellation lock was lost; try again",
        });
      }

      const cancelled = await prisma.payment.updateMany({
        where: {
          id: paymentId,
          initiated_by: userId,
          status: "processing",
          locked_by: cancellationOwner,
          locked_until: { gt: new Date() },
          OR: [{ current_step: null }, { current_step: "validation" }],
        },
        data: {
          status: "cancelled",
          current_step: "cancelled",
          failure_reason: "Cancelled by user",
          next_retry_at: null,
          locked_by: null,
          locked_until: null,
        },
      });

      if (cancelled.count !== 1) {
        return res.status(409).json({
          success: false,
          message: "Payment changed while cancellation was being completed",
        });
      }

      const cancelledPayment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      return res.status(200).json({
        success: true,
        message: "Payment cancelled",
        payment: serializePayment(cancelledPayment),
      });
    } finally {
      try {
        await releasePaymentLock(paymentId, cancellationOwner);
      } catch (releaseLockError) {
        console.error("Failed to release cancellation lock:", {
          paymentId,
          message: releaseLockError.message,
        });
      }
    }
  } catch (error) {
    console.error("Payment Cancellation Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }

});
router.get("/internal/:id", internalAuth, async (req, res) => {
  try {
    const validation = z.string().uuid().safeParse(req.params.id);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID",
      });
    }

    const payment = await prisma.payment.findUnique({
      where: {
        id: validation.data,
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment: {
        ...payment,
        amount: payment.amount.toString(),
      },
    });
  } catch (error) {
    console.error("Internal Payment Fetch Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
export default router;
