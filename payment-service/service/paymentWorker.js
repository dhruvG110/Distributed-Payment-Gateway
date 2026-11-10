
import prisma from "../db.js";
import { processPayment } from "./payment-orchestrator.js";

const POLL_INTERVAL = 5000;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 5000;
const MAX_RETRY_DELAY = 5 * 60 * 1000;
const BATCH_SIZE = 10;

let workerTimer = null;
let workerRunning = false;
let shouldStop = false;

// Find eligible payments
const getEligiblePayments = async () => {
  const now = new Date();

  return prisma.payment.findMany({
    where: {
      retry_count: {
        lt: MAX_RETRIES,
      },

      AND: [
        {
          OR: [
            { next_retry_at: null },
            { next_retry_at: { lte: now } },
          ],
        },

        {
          OR: [
            {
              status: "pending",
              OR: [
                {
                  AND: [
                    { locked_by: null },
                    { locked_until: null },
                  ],
                },
                { locked_until: { lte: now } },
              ],
            },
            {
              status: "processing",
              OR: [
                {
                  AND: [
                    { locked_by: null },
                    { locked_until: null },
                  ],
                },
                { locked_until: { lte: now } },
              ],
            },
          ],
        },
      ],
    },
    take: BATCH_SIZE,
  });
};

// Calculate exponential retry delay
const calculateRetryDelay = (retryCount) => {
  return Math.min(
    BASE_RETRY_DELAY * Math.pow(2, retryCount),
    MAX_RETRY_DELAY
  );
};

// Schedule next retry
const scheduleRetry = async (payment) => {
  const nextRetryCount = payment.retry_count + 1;

  const delay = calculateRetryDelay(payment.retry_count);
  const nextRetryAt = new Date(Date.now() + delay);

  const result = await prisma.payment.updateMany({
    where: {
      id: payment.id,
      status: "processing",
      locked_by: null,
      locked_until: null,
      retry_count: payment.retry_count,
    },
    data: {
      retry_count: {
        increment: 1,
      },
      next_retry_at: nextRetryAt,
    },
  });

  if (result.count === 1) {
    console.log("PAYMENT RETRY SCHEDULED:", {
      paymentId: payment.id,
      retryCount: nextRetryCount,
      nextRetryAt,
    });
  }
};

// Handle exhausted retries
const logExhaustedRetries = async () => {
  const exhaustedPayments = await prisma.payment.findMany({
    where: {
      status: "processing",
      retry_count: {
        gte: MAX_RETRIES,
      },
      locked_by: null,
      locked_until: null,
    },
    select: {
      id: true,
      retry_count: true,
      last_error: true,
    },
  });

  for (const payment of exhaustedPayments) {
    console.error("PAYMENT REQUIRES MANUAL INVESTIGATION:", payment);
  }
};

// Process eligible payments
export const runPaymentWorkerOnce = async () => {
  const payments = await getEligiblePayments();

  for (const payment of payments) {
    console.log("WORKER PROCESSING:", payment.id);

    try {
      const result = await processPayment(payment);

      if (result?.success) {
        console.log("WORKER PAYMENT SUCCEEDED:", payment.id);
        continue;
      }

      // Another worker owns the payment
      if (result?.statusCode === 409) {
        continue;
      }

      // Retry processing failures
      if (result?.statusCode === 500) {
        if (payment.retry_count + 1 >= MAX_RETRIES) {
          console.error(
            "MAX RETRIES REACHED. MANUAL INVESTIGATION REQUIRED:",
            payment.id
          );
        } else {
          await scheduleRetry(payment);
        }
      }

    } catch (error) {
      console.error("WORKER ERROR:", {
        paymentId: payment.id,
        message: error.message,
      });
    }
  }

  await logExhaustedRetries();
};

// Start worker
export const startPaymentWorker = () => {
  if (workerTimer || workerRunning) {
    console.log("Payment worker is already running");
    return;
  }

  shouldStop = false;

  const run = async () => {
    if (shouldStop) return;

    workerRunning = true;

    try {
      await runPaymentWorkerOnce();
    } catch (error) {
      console.error("PAYMENT WORKER ERROR:", error.message);
    } finally {
      workerRunning = false;

      if (!shouldStop) {
        workerTimer = setTimeout(run, POLL_INTERVAL);
      }
    }
  };

  console.log("PAYMENT WORKER STARTED");
  void run();
};

// Stop worker
export const stopPaymentWorker = () => {
  shouldStop = true;

  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }

  console.log("PAYMENT WORKER STOP REQUESTED");
};
