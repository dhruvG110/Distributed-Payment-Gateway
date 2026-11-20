import dotenv from "dotenv";
dotenv.config();
import express from "express";
import prisma from "../db.js";
import { z } from "zod";
import authMiddleware from "../middleware/auth.middleware.js";
import internalAuth from "../middleware/internalAuth.js";
import {
  listWalletOperationsByPayment,
  paymentIdQuerySchema,
} from "../service/walletOperationLookup.js";
import rateLimiter from "../middleware/rateLimiter.js";

const router = express.Router();
router.use(rateLimiter)
const userIdSchema = z.string().uuid();
const walletIdSchema = z.string().uuid();
const walletCreateSchema = z
  .object({
    user_id: userIdSchema,
    balance: z.bigint(),
    currency: z.string().max(3),
    status: z.enum(["active", "frozen"]),
  })
  .strict();

const serializeWallet = (wallet) => ({
  ...wallet,
  balance: wallet.balance.toString(),
});

router.get("/internal/operations/", internalAuth, rateLimiter, async (req, res) => {
  const validation = paymentIdQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment ID",
      errors: validation.error.issues,
    });
  }

  try {
    // This lookup is read-only and returns only operations owned by this payment.
    const operations = await listWalletOperationsByPayment(
      prisma,
      validation.data.paymentId,
    );
    return res.status(200).json({
      success: true,
      operations,
    });
  } catch (error) {
    console.error("Wallet operation lookup failed:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.post("/create", authMiddleware,rateLimiter, async (req, res) => {
  try {
    const validation = walletCreateSchema.safeParse({
      user_id: req.user.id,
      balance: 0n,
      currency: "INR",
      status: "active",
    });
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.issues[0].message,
      });
    }

    const wallet = await prisma.$transaction(async (tx) => {
      const createdWallet = await tx.wallet.create({
        data: validation.data,
      });

      await tx.wallet_event.create({
        data: {
          wallet_id: createdWallet.id,
          event_type: "created",
        },
      });

      return createdWallet;
    });

    return res.status(201).json({
      success: true,
      message: "Wallet created successfully",
      wallet: serializeWallet(wallet),
    });
  } catch (error) {
    console.error("Wallet Creation Error:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Wallet already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.get("/me", authMiddleware,rateLimiter, async (req, res) => {
  try {
    const validation = userIdSchema.safeParse(req.user.id);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { user_id: validation.data },
    });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    return res.status(200).json({
      success: true,
      wallet: serializeWallet(wallet),
    });
  } catch (error) {
    console.error("Wallet Fetch Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.get("/transactions", authMiddleware,rateLimiter, async (req, res) => {
  try {
    const validation = userIdSchema.safeParse(req.user.id);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { user_id: validation.data },
      select: { id: true },
    });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    const transactions = await prisma.wallet_event.findMany({
      where: { wallet_id: wallet.id },
      orderBy: { created_at: "desc" },
    });

    return res.status(200).json({
      success: true,
      transactions,
    });
  } catch (error) {
    console.error("Wallet Transaction History Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.get("/:id", authMiddleware,rateLimiter, async (req, res) => {
  try {
    const idValidation = walletIdSchema.safeParse(req.params.id);
    const userValidation = userIdSchema.safeParse(req.user.id);
    if (!idValidation.success || !userValidation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid wallet or user ID",
      });
    }

    const wallet = await prisma.wallet.findFirst({
      where: {
        id: idValidation.data,
        user_id: userValidation.data,
      },
    });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    return res.status(200).json({
      success: true,
      wallet: serializeWallet(wallet),
    });
  } catch (error) {
    console.error("Wallet Fetch Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

const updateWalletStatus = async (
  userId,
  currentStatus,
  nextStatus,
  eventType,
) =>
  prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { user_id: userId },
    });
    if (!wallet) {
      return { result: "not_found" };
    }
    if (wallet.status !== currentStatus) {
      return { result: "invalid_state" };
    }

    const updated = await tx.wallet.updateMany({
      where: {
        id: wallet.id,
        user_id: userId,
        status: currentStatus,
      },
      data: {
        status: nextStatus,
        updated_at: new Date(),
      },
    });
    if (updated.count !== 1) {
      return { result: "concurrent_change" };
    }

    await tx.wallet_event.create({
      data: {
        wallet_id: wallet.id,
        event_type: eventType,
      },
    });

    return {
      result: "updated",
      wallet: {
        ...wallet,
        status: nextStatus,
      },
    };
  });

const handleWalletStatusChange =
  (currentStatus, nextStatus, eventType) => async (req, res) => {
    try {
      const validation = userIdSchema.safeParse(req.user.id);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const outcome = await updateWalletStatus(
        validation.data,
        currentStatus,
        nextStatus,
        eventType,
      );
      if (outcome.result === "not_found") {
        return res.status(404).json({
          success: false,
          message: "Wallet not found",
        });
      }
      if (outcome.result !== "updated") {
        return res.status(409).json({
          success: false,
          message:
            outcome.result === "invalid_state"
              ? `Wallet is not ${currentStatus}`
              : "Wallet status changed concurrently; try again",
        });
      }

      return res.status(200).json({
        success: true,
        message: `Wallet ${eventType === "freeze" ? "frozen" : "unfrozen"} successfully`,
        wallet: serializeWallet(outcome.wallet),
      });
    } catch (error) {
      console.error(`Wallet ${eventType} Error:`, error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

router.patch(
  "/freeze",
  authMiddleware,
  handleWalletStatusChange("active", "frozen", "freeze"),
);
router.patch(
  "/unfreeze",
  authMiddleware,
  handleWalletStatusChange("frozen", "active", "unfreeze"),
);
const reserveSchema = z
  .object({
    wallet_id: z.string().uuid(),
    payment_id: z.string().uuid(),
    amount: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(BigInt),
  })
  .strict();

router.post("/internal/reserve", internalAuth,rateLimiter, async (req, res) => {
  try {
    // 1. Validate request
    const validation = reserveSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid reservation request",
        errors: validation.error.issues,
      });
    }

    const { wallet_id, payment_id, amount } = validation.data;

    // Helper: Handle existing reservation
    const handleExistingOperation = async (operation) => {
      if (operation.wallet_id !== wallet_id || operation.amount !== amount) {
        return res.status(409).json({
          success: false,
          message: "Existing reservation conflicts with this request",
        });
      }

      if (operation.status !== "reserved") {
        return res.status(409).json({
          success: false,
          message: `Reservation is already ${operation.status}`,
        });
      }

      const wallet = await prisma.wallet.findUnique({
        where: { id: wallet_id },
      });

      return res.status(200).json({
        success: true,
        message: "Funds already reserved",
        reservation: {
          operation_id: operation.id,
          payment_id,
          wallet_id,
          amount: amount.toString(),
          status: operation.status,
        },
        wallet: wallet ? serializeWallet(wallet) : null,
      });
    };

    // 2. Check existing reservation
    const existingOperation = await prisma.wallet_operation.findUnique({
      where: {
        payment_id_operation: {
          payment_id,
          operation: "reserve",
        },
      },
    });

    if (existingOperation) {
      return await handleExistingOperation(existingOperation);
    }

    // 3. Atomic reservation transaction
    const result = await prisma.$transaction(async (tx) => {
      // Atomic balance decrement
      const updated = await tx.wallet.updateMany({
        where: {
          id: wallet_id,
          balance: { gte: amount },
          status: "active",
        },
        data: {
          balance: { decrement: amount },
          updated_at: new Date(),
        },
      });

      // Identify failure reason
      if (updated.count !== 1) {
        const wallet = await tx.wallet.findUnique({
          where: { id: wallet_id },
        });

        if (!wallet) {
          return { type: "NOT_FOUND" };
        }

        if (wallet.status !== "active") {
          return { type: "FROZEN" };
        }

        return { type: "INSUFFICIENT_BALANCE" };
      }

      // Create reservation record
      const operation = await tx.wallet_operation.create({
        data: {
          wallet_id,
          payment_id,
          amount,
          operation: "reserve",
          status: "reserved",
        },
      });

      // Fetch updated wallet
      const updatedWallet = await tx.wallet.findUnique({
        where: { id: wallet_id },
      });

      return {
        type: "SUCCESS",
        operation,
        wallet: updatedWallet,
      };
    });

    // 4. Handle transaction results
    if (result.type === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    if (result.type === "FROZEN") {
      return res.status(409).json({
        success: false,
        message: "Wallet is not active",
      });
    }

    if (result.type === "INSUFFICIENT_BALANCE") {
      return res.status(409).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    // 5. Success response
    return res.status(200).json({
      success: true,
      message: "Balance reserved successfully",
      reservation: {
        operation_id: result.operation.id,
        payment_id,
        wallet_id,
        amount: amount.toString(),
        status: "reserved",
      },
      wallet: serializeWallet(result.wallet),
    });
  } catch (error) {
    console.error("Reserve funds error:", error);

    // 6. Handle concurrent duplicate requests
    if (error.code === "P2002") {
      const validation = reserveSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(409).json({
          success: false,
          message: "Conflicting reservation already exists",
        });
      }

      const { wallet_id, payment_id, amount } = validation.data;
      let existingOperation;
      let wallet;
      try {
        existingOperation = await prisma.wallet_operation.findUnique({
          where: {
            payment_id_operation: {
              payment_id,
              operation: "reserve",
            },
          },
        });
        if (
          existingOperation?.wallet_id === wallet_id &&
          existingOperation.amount === amount &&
          existingOperation.status === "reserved"
        ) {
          wallet = await prisma.wallet.findUnique({
            where: { id: wallet_id },
          });
        }
      } catch (recoveryError) {
        console.error("Reserve idempotency recovery error:", recoveryError);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }

      if (
        existingOperation?.wallet_id === wallet_id &&
        existingOperation.amount === amount &&
        existingOperation.status === "reserved"
      ) {
        return res.status(200).json({
          success: true,
          message: "Funds already reserved",
          reservation: {
            operation_id: existingOperation.id,
            payment_id,
            wallet_id,
            amount: amount.toString(),
            status: existingOperation.status,
          },
          wallet: wallet ? serializeWallet(wallet) : null,
        });
      }

      return res.status(409).json({
        success: false,
        message: "Conflicting reservation already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

const releaseSchema = z
  .object({
    payment_id: z.string().uuid(),
  })
  .strict();

router.post("/internal/release", internalAuth,rateLimiter, async (req, res) => {
  try {
    const validation = releaseSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid release request",
        errors: validation.error.issues,
      });
    }

    const { payment_id } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      const operation = await tx.wallet_operation.findUnique({
        where: {
          payment_id_operation: {
            payment_id,
            operation: "reserve",
          },
        },
      });

      if (!operation) {
        return { type: "NOT_FOUND" };
      }

      if (operation.status === "released") {
        return { type: "ALREADY_RELEASED" };
      }

      if (operation.status === "committed") {
        return { type: "COMMITTED" };
      }
      if (operation.status !== "reserved") {
        return { type: "INVALID_STATE" };
      }

      // Atomically claim the reservation for release
      const updatedOperation = await tx.wallet_operation.updateMany({
        where: {
          id: operation.id,
          status: "reserved",
        },
        data: {
          status: "released",
        },
      });

      if (updatedOperation.count !== 1) {
        const currentOperation = await tx.wallet_operation.findUnique({
          where: { id: operation.id },
        });
        return {
          type: currentOperation?.status === "released"
            ? "ALREADY_RELEASED"
            : "CONFLICT",
        };
      }

      // Return reserved amount to wallet
      const updatedWallet = await tx.wallet.updateMany({
        where: {
          id: operation.wallet_id,
        },
        data: {
          balance: {
            increment: operation.amount,
          },
          updated_at: new Date(),
        },
      });

      if (updatedWallet.count !== 1) {
        throw new Error("Wallet balance restoration failed");
      }

      return { type: "SUCCESS" };
    });

    if (result.type === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    if (result.type === "ALREADY_RELEASED") {
      return res.status(200).json({
        success: true,
        message: "Funds were already released",
        payment_id,
        status: "released",
      });
    }

    if (result.type === "COMMITTED") {
      return res.status(409).json({
        success: false,
        message: "Payment already committed",
      });
    }

    if (result.type === "INVALID_STATE" || result.type === "CONFLICT") {
      return res.status(409).json({
        success: false,
        message: "Reservation cannot be released",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Funds released successfully",
      payment_id,
      status: "released",
    });
  } catch (error) {
    console.error("Release funds error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
const commitSchema = z
  .object({
    payment_id: z.string().uuid(),
  })
  .strict();

router.post("/internal/commit", internalAuth,rateLimiter, async (req, res) => {
  try {
    const validation = commitSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid commit request",
        errors: validation.error.issues,
      });
    }

    const { payment_id } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.wallet_operation.findUnique({
        where: {
          payment_id_operation: {
            payment_id,
            operation: "reserve",
          },
        },
      });

      if (!reservation) {
        return { type: "NOT_FOUND" };
      }

      if (reservation.status === "committed") {
        return { type: "ALREADY_COMMITTED" };
      }

      if (reservation.status === "released") {
        return { type: "RELEASED" };
      }

      if (reservation.status !== "reserved") {
        return { type: "INVALID_STATE" };
      }

      const updatedReservation = await tx.wallet_operation.updateMany({
        where: {
          id: reservation.id,
          status: "reserved",
        },
        data: {
          status: "committed",
        },
      });

      if (updatedReservation.count !== 1) {
        const currentReservation = await tx.wallet_operation.findUnique({
          where: { id: reservation.id },
        });
        if (currentReservation?.status === "committed") {
          return { type: "ALREADY_COMMITTED" };
        }
        if (currentReservation?.status === "released") {
          return { type: "RELEASED" };
        }
        return { type: "CONFLICT" };
      }

      return { type: "SUCCESS" };
    });

    if (result.type === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    if (result.type === "RELEASED") {
      return res.status(409).json({
        success: false,
        message: "Released reservation cannot be committed",
      });
    }

    if (result.type === "INVALID_STATE" || result.type === "CONFLICT") {
      return res.status(409).json({
        success: false,
        message: "Reservation cannot be committed",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        result.type === "ALREADY_COMMITTED"
          ? "Funds were already committed"
          : "Funds committed successfully",
      payment_id,
      status: "committed",
    });
  } catch (error) {
    console.error("Commit funds error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
const creditSchema = z
  .object({
    wallet_id: z.string().uuid(),
    payment_id: z.string().uuid(),
    amount: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(BigInt),
  })
  .strict();

router.post("/internal/credit", internalAuth, rateLimiter, async (req, res) => {
  try {
    const validation = creditSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid credit request",
        errors: validation.error.issues,
      });
    }

    const { wallet_id, payment_id, amount } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Check sender reservation
      const reservation = await tx.wallet_operation.findUnique({
        where: {
          payment_id_operation: {
            payment_id,
            operation: "reserve",
          },
        },
      });

      if (
        !reservation ||
        reservation.status !== "committed" ||
        reservation.amount !== amount
      ) {
        return { type: "RESERVATION_NOT_FOUND" };
      }
      // 2. Check duplicate credit
      const existingOperation = await tx.wallet_operation.findUnique({
        where: {
          payment_id_operation: {
            payment_id,
            operation: "credit",
          },
        },
      });

      if (existingOperation) {
        if (
          existingOperation.wallet_id !== wallet_id ||
          existingOperation.amount !== amount ||
          existingOperation.status !== "committed"
        ) {
          return { type: "CREDIT_CONFLICT" };
        }

        return { type: "DUPLICATE" };
      }

      // 3. Check receiver wallet
      const wallet = await tx.wallet.findUnique({
        where: { id: wallet_id },
      });

      if (!wallet) {
        return { type: "WALLET_NOT_FOUND" };
      }

      if (wallet.status !== "active") {
        return { type: "WALLET_INACTIVE" };
      }

      // 4. Atomic credit
      const updated = await tx.wallet.updateMany({
        where: {
          id: wallet_id,
          status: "active",
        },
        data: {
          balance: { increment: amount },
          updated_at: new Date(),
        },
      });

      if (updated.count !== 1) {
        return { type: "CONFLICT" };
      }

      // 5. Create credit operation
      const operation = await tx.wallet_operation.create({
        data: {
          wallet_id,
          payment_id,
          amount,
          operation: "credit",
          status: "committed",
        },
      });

      return {
        type: "SUCCESS",
        operation,
      };
    });

    if (result.type === "RESERVATION_NOT_FOUND") {
      return res.status(409).json({
        success: false,
        message: "Valid sender reservation not found",
      });
    }

    if (result.type === "DUPLICATE") {
      return res.status(200).json({
        success: true,
        message: "Receiver was already credited",
        payment_id,
        status: "committed",
      });
    }

    if (result.type === "WALLET_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Receiver wallet not found",
      });
    }

    if (result.type === "WALLET_INACTIVE" || result.type === "CONFLICT") {
      return res.status(409).json({
        success: false,
        message: "Receiver wallet cannot be credited",
      });
    }
    if (result.type === "CREDIT_CONFLICT") {
      return res.status(409).json({
        success: false,
        message: "Existing credit conflicts with this request",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Receiver wallet credited successfully",
      credit: {
        payment_id,
        wallet_id,
        amount: amount.toString(),
        operation: "credit",
        status: "committed",
      },
    });
  } catch (error) {
    console.error("Credit funds error:", error);

    if (error.code === "P2002") {
      const validation = creditSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(409).json({
          success: false,
          message: "Conflicting credit already exists",
        });
      }

      const { wallet_id, payment_id, amount } = validation.data;
      let existingOperation;
      try {
        existingOperation = await prisma.wallet_operation.findUnique({
          where: {
            payment_id_operation: {
              payment_id,
              operation: "credit",
            },
          },
        });
      } catch (recoveryError) {
        console.error("Credit idempotency recovery error:", recoveryError);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }

      if (
        existingOperation?.wallet_id === wallet_id &&
        existingOperation.amount === amount &&
        existingOperation.status === "committed"
      ) {
        return res.status(200).json({
          success: true,
          message: "Receiver was already credited",
          payment_id,
          status: "committed",
        });
      }

      return res.status(409).json({
        success: false,
        message: "Existing credit conflicts with this request",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
export default router;
