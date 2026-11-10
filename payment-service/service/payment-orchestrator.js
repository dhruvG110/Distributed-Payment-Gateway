
import prisma from "../db.js";
import { z } from "zod";
import axios from "axios";

import {
  releaseLock,
  acquireLock,
  renewLock,
} from "./paymentLock.js";

import {
  inspectPaymentState,
  determineRecoveryStep,
} from "./paymentRecovery.js";

const paymentSchema = z.object({
  id: z.string().uuid(),
  sender_wallet_id: z.string().uuid(),
  receiver_wallet_id: z.string().uuid(),

  amount: z
    .union([z.string(), z.bigint()])
    .transform((value) => value.toString())
    .pipe(z.string().regex(/^[1-9]\d*$/)),

  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .default("INR"),
});

export const processPayment = async (payment) => {
  // Validate payment
  const result = paymentSchema.safeParse(payment);

  if (!result.success) {
    return {
      success: false,
      message: "Invalid payment details",
      statusCode: 400,
    };
  }

  const data = result.data;

  if (data.sender_wallet_id === data.receiver_wallet_id) {
    return {
      success: false,
      message: "Sender and receiver cannot be the same",
      statusCode: 400,
    };
  }

  // Acquire lock
  const lockOwner = await acquireLock(data.id);

  if (!lockOwner) {
    return {
      success: false,
      message: "Payment is already being processed",
      statusCode: 409,
    };
  }

  let lockLost = false;

  // Lock heartbeat
  const heartbeat = setInterval(async () => {
    try {
      const renewed = await renewLock(data.id, lockOwner);

      if (!renewed) {
        lockLost = true;
        console.error("Payment lock renewal failed:", data.id);
      }
    } catch (error) {
      lockLost = true;
      console.error("Heartbeat error:", error.message);
    }
  }, 10000);

  // Helper to update payment step safely
  const updatePaymentStep = async (step) => {
    if (lockLost) {
      throw new Error("Payment lock lost");
    }

    const result = await prisma.payment.updateMany({
      where: {
        id: data.id,
        status: "processing",
        locked_by: lockOwner,
        locked_until: {
          gt: new Date(),
        },
      },
      data: {
        current_step: step,
      },
    });

    if (result.count !== 1) {
      throw new Error("Payment lock lost");
    }
  };

  // Internal API configuration
  const internalConfig = {
    headers: {
      "x-internal-secret": process.env.INTERNAL_API_SECRET,
    },
    timeout: 5000,
  };

  try {
    if (lockLost) {
      throw new Error("Payment lock lost");
    }

    // Verify lock ownership
    const currentPayment = await prisma.payment.findFirst({
      where: {
        id: data.id,
        status: "processing",
        locked_by: lockOwner,
        locked_until: {
          gt: new Date(),
        },
      },
    });

    if (!currentPayment) {
      throw new Error("Payment lock is no longer valid");
    }

    // Inspect existing financial operations
    const recoveryState = await inspectPaymentState(currentPayment);

    if (lockLost) {
      throw new Error("Payment lock lost during state inspection");
    }

    const recoveryStep = determineRecoveryStep(recoveryState);

    console.log("PAYMENT RECOVERY STATE:", {
      paymentId: data.id,
      recoveryStep,
    });

    // Step 1: Reserve sender amount
    if (recoveryStep === "RESERVING") {
      await updatePaymentStep("RESERVING");

      const reserveResponse = await axios.post(
        `${process.env.WALLET_SERVICE_URL}/api/wallet/internal/reserve`,
        {
          wallet_id: data.sender_wallet_id,
          payment_id: data.id,
          amount: data.amount,
        },
        internalConfig
      );

      console.log("RESERVE RESPONSE:", reserveResponse.data);
    }

    // Step 2: Post ledger transaction
    if (
      recoveryStep === "RESERVING" ||
      recoveryStep === "LEDGER_POSTING"
    ) {
      await updatePaymentStep("LEDGER_POSTING");

      const ledgerResponse = await axios.post(
        `${process.env.LEDGER_SERVICE_URL}/api/ledger/post`,
        {
          payment_id: data.id,
        },
        internalConfig
      );

      console.log("LEDGER RESPONSE:", ledgerResponse.data);
    }

    // Step 3: Commit sender reservation
    if (
      recoveryStep === "RESERVING" ||
      recoveryStep === "LEDGER_POSTING" ||
      recoveryStep === "COMMITTING"
    ) {
      await updatePaymentStep("COMMITTING");

      const commitResponse = await axios.post(
        `${process.env.WALLET_SERVICE_URL}/api/wallet/internal/commit`,
        {
          payment_id: data.id,
        },
        internalConfig
      );

      console.log("COMMIT RESPONSE:", commitResponse.data);
    }

    // Step 4: Credit receiver
    if (
      recoveryStep === "RESERVING" ||
      recoveryStep === "LEDGER_POSTING" ||
      recoveryStep === "COMMITTING" ||
      recoveryStep === "CREDITING"
    ) {
      await updatePaymentStep("CREDITING");

      const creditResponse = await axios.post(
        `${process.env.WALLET_SERVICE_URL}/api/wallet/internal/credit`,
        {
          wallet_id: data.receiver_wallet_id,
          payment_id: data.id,
          amount: data.amount,
        },
        internalConfig
      );

      console.log("CREDIT RESPONSE:", creditResponse.data);
    }

    // Check lock before final status update
    if (lockLost) {
      throw new Error("Payment lock lost before completion");
    }

    // Mark payment as succeeded
    const paymentUpdate = await prisma.payment.updateMany({
      where: {
        id: data.id,
        status: "processing",
        locked_by: lockOwner,
        locked_until: {
          gt: new Date(),
        },
      },
      data: {
        status: "succeeded",
        current_step: "COMPLETED",
        last_error: null,
        failure_reason: null,
        next_retry_at: null,
      },
    });

    if (paymentUpdate.count !== 1) {
      throw new Error("Could not mark payment as succeeded");
    }

    return {
      success: true,
      message: "Payment completed successfully",
      statusCode: 200,
    };

  } catch (error) {
    console.error("PAYMENT PROCESSING ERROR:", {
      message: error.message,
      status: error.response?.status,
      response: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
    });

    // Save error only if lock is still valid
    try {
      await prisma.payment.updateMany({
        where: {
          id: data.id,
          status: "processing",
          locked_by: lockOwner,
          locked_until: {
            gt: new Date(),
          },
        },
        data: {
          last_error: error.message,
        },
      });
    } catch (dbError) {
      console.error("Could not save payment error:", dbError.message);
    }

    return {
      success: false,
      message: "Payment processing requires recovery",
      statusCode: 500,
    };

  } finally {
    clearInterval(heartbeat);

    try {
      await releaseLock(data.id, lockOwner);
    } catch (releaseError) {
      console.error("Could not release payment lock:", releaseError.message);
    }
  }
};
