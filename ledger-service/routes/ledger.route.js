import express from "express";
import { z } from "zod";
import axios from "axios";
import prisma from "../db.js";
import internalAuth from "../middleware/internalAuth.js";
import {
  findLedgerTransactionByPayment,
  paymentIdQuerySchema,
} from "../service/ledgerLookup.js";

const router = express.Router();

// Request validation
const ledgerSchema = z
  .object({
    payment_id: z.string().uuid(),
  })
  .strict();

router.get("/internal/", internalAuth, async (req, res) => {
  const validation = paymentIdQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment ID",
      errors: validation.error.issues,
    });
  }

  try {
    const transaction = await findLedgerTransactionByPayment(
      prisma,
      validation.data.paymentId,
    );
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Ledger transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error("Ledger transaction lookup failed:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// POST LEDGER ENTRY
router.post("/post", internalAuth, async (req, res) => {
  try {
    // 1. Validate request
    const validation = ledgerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid ledger post request",
        errors: validation.error.issues,
      });
    }

    const { payment_id } = validation.data;

    // 2. Check duplicate ledger transaction
    const existingTransaction = await prisma.ledger_transaction.findUnique({
      where: {
        payment_id,
      },
      include: {
        entries: true,
      },
    });

    if (existingTransaction) {
      return res.status(200).json({
        success: true,
        message: "Ledger transaction already posted",
        transaction: {
          id: existingTransaction.id,
          payment_id: existingTransaction.payment_id,
          amount: existingTransaction.amount.toString(),
          currency: existingTransaction.currency,
          status: existingTransaction.status,
        },
        total_debit: existingTransaction.amount.toString(),
        total_credit: existingTransaction.amount.toString(),
      });
    }

    // 3. Fetch payment from Payment Service
    const paymentResponse = await axios.get(
      `${process.env.PAYMENT_SERVICE_URL}/api/payments/internal/${payment_id}`,
      {
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET,
        },
        timeout: 5000,
      },
    );

    const payment = paymentResponse.data.payment;

    // 4. Verify payment details
    if (!payment || payment.status !== "processing") {
      return res.status(400).json({
        success: false,
        message: "Payment is not eligible for ledger posting",
      });
    }

    const amount = BigInt(payment.amount);

    if (amount <= 0n) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    if (payment.sender_wallet_id === payment.receiver_wallet_id) {
      return res.status(400).json({
        success: false,
        message: "Sender and receiver cannot be the same",
      });
    }

    // 5. Create double-entry ledger transaction
    const ledgerTransaction = await prisma.$transaction(async (tx) => {
      const transaction = await tx.ledger_transaction.create({
        data: {
          payment_id: payment.id,
          reference: `PAY-${payment.id}`,
          amount,
          currency: payment.currency,
          status: "posted",
        },
      });

      // Debit sender
      await tx.ledger_entry.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: payment.sender_wallet_id,
          entry_type: "debit",
          amount,
          currency: payment.currency,
        },
      });

      // Credit receiver
      await tx.ledger_entry.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: payment.receiver_wallet_id,
          entry_type: "credit",
          amount,
          currency: payment.currency,
        },
      });

      return transaction;
    });

    // 6. Success response
    return res.status(201).json({
      success: true,
      message: "Ledger transaction posted successfully",
      transaction: {
        id: ledgerTransaction.id,
        payment_id: ledgerTransaction.payment_id,
        amount: ledgerTransaction.amount.toString(),
        currency: ledgerTransaction.currency,
        status: ledgerTransaction.status,
      },
      total_debit: amount.toString(),
      total_credit: amount.toString(),
    });
  } catch (error) {
    console.error("Ledger Posting Error:", error);

    // Handle duplicate concurrent requests
    if (error.code === "P2002") {
      const existingTransaction = await prisma.ledger_transaction.findUnique({
        where: {
          payment_id: req.body.payment_id,
        },
      });

      if (existingTransaction) {
        return res.status(200).json({
          success: true,
          message: "Ledger transaction already posted",
          transaction: {
            id: existingTransaction.id,
            payment_id: existingTransaction.payment_id,
            amount: existingTransaction.amount.toString(),
            currency: existingTransaction.currency,
            status: existingTransaction.status,
          },
          total_debit: existingTransaction.amount.toString(),
          total_credit: existingTransaction.amount.toString(),
        });
      }
    }

    if (axios.isAxiosError(error)) {
      return res.status(502).json({
        success: false,
        message: "Payment Service verification failed",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
