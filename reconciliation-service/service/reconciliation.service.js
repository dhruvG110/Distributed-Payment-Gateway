import axios from "axios";
import prisma from "../db.js";
import {
  evaluatePayment,
  ledgerResponseSchema,
  paymentIdSchema,
  paymentResponseSchema,
  walletResponseSchema,
} from "./reconciliation.policy.js";

const MAX_API_ATTEMPTS = 3;
const RETRY_DELAY_MS = 150;
let reconciliationRunning = false;

const isTemporaryError = (error) =>
  !error.response ||
  error.code === "ECONNABORTED" ||
  error.code === "ETIMEDOUT" ||
  error.response.status === 408 ||
  error.response.status === 429 ||
  error.response.status >= 500;

const sleep = (duration) =>
  new Promise((resolve) => setTimeout(resolve, duration));

export const requestWithRetry = async (request, pause = sleep) => {
  for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (attempt === MAX_API_ATTEMPTS || !isTemporaryError(error)) {
        throw error;
      }
      await pause(RETRY_DELAY_MS * attempt);
    }
  }
};

const internalHeaders = () => ({
  "x-internal-secret": process.env.INTERNAL_API_SECRET,
});

const fetchPayment = async (paymentId) => {
  const response = await requestWithRetry(() =>
    axios.get(
      `${process.env.PAYMENT_SERVICE_URL}/api/payments/internal/${paymentId}`,
      { headers: internalHeaders(), timeout: 5000 },
    ),
  );
  const payment = paymentResponseSchema.safeParse(response.data?.payment);
  if (!payment.success) throw new Error("Payment Service returned an invalid response");
  return payment.data;
};

const fetchWalletOperations = async (paymentId) => {
  const response = await requestWithRetry(() =>
    axios.get(`${process.env.WALLET_SERVICE_URL}/api/wallet/internal/operations/`, {
      params: { paymentId },
      headers: internalHeaders(),
      timeout: 5000,
    }),
  );
  const operations = walletResponseSchema.safeParse(response.data);
  if (!operations.success) throw new Error("Wallet Service returned an invalid response");
  if (operations.data.operations.some((operation) => operation.payment_id !== paymentId)) {
    throw new Error("Wallet Service returned an operation for a different payment");
  }
  return operations.data.operations;
};

const fetchLedgerTransaction = async (paymentId) => {
  try {
    const response = await requestWithRetry(() =>
      axios.get(`${process.env.LEDGER_SERVICE_URL}/api/ledger/internal/`, {
        params: { paymentId },
        headers: internalHeaders(),
        timeout: 5000,
      }),
    );
    const transaction = ledgerResponseSchema.safeParse(response.data);
    if (!transaction.success) throw new Error("Ledger Service returned an invalid response");
    if (transaction.data.transaction.payment_id !== paymentId) {
      throw new Error("Ledger Service returned a transaction for a different payment");
    }
    return transaction.data.transaction;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
};

const recordForFailure = (paymentId, message, status = "needs_review") => ({
  payment_id: paymentId,
  status,
  expected_amount: null,
  wallet_debit: null,
  wallet_credit: null,
  ledger_debit: null,
  ledger_credit: null,
  mismatch_reason: message,
  details: { error: message },
});

export const reconcilePayment = async (
  paymentId,
  { fetchPaymentData = fetchPayment, fetchWalletData = fetchWalletOperations,
    fetchLedgerData = fetchLedgerTransaction } = {},
) => {
  const validId = paymentIdSchema.safeParse(paymentId);
  if (!validId.success) {
    return recordForFailure(String(paymentId), "Invalid payment ID", "mismatched");
  }

  let payment;
  try {
    payment = await fetchPaymentData(validId.data);
  } catch (error) {
    return recordForFailure(
      validId.data,
      error.response?.status === 404
        ? "Payment was not found"
        : `Payment Service error: ${error.message}`,
    );
  }

  let operations;
  let transaction;
  try {
    [operations, transaction] = await Promise.all([
      fetchWalletData(validId.data),
      fetchLedgerData(validId.data),
    ]);
  } catch (error) {
    return {
      ...recordForFailure(validId.data, `External service error: ${error.message}`),
      expected_amount: BigInt(payment.amount),
      details: {
        payment,
        error: error.message,
      },
    };
  }

  return evaluatePayment({ payment, operations, transaction });
};

export const runReconciliation = async (
  paymentIds,
  { prismaClient = prisma, reconcile = reconcilePayment } = {},
) => {
  if (reconciliationRunning) {
    const error = new Error("A reconciliation run is already active");
    error.code = "RECONCILIATION_RUNNING";
    throw error;
  }
  reconciliationRunning = true;

  let run;
  try {
    const uniquePaymentIds = [...new Set(paymentIds)];
    run = await prismaClient.reconciliation_run.create({
      data: { status: "running" },
    });
    const counters = {
      total_checked: 0,
      matched_count: 0,
      mismatched_count: 0,
      incomplete_count: 0,
      needs_review_count: 0,
      error_count: 0,
    };

    for (const paymentId of uniquePaymentIds) {
      let result;
      try {
        result = await reconcile(paymentId);
      } catch (error) {
        result = recordForFailure(paymentId, `Reconciliation failed: ${error.message}`);
      }

      try {
        await prismaClient.reconciliation_record.create({
          data: {
            run_id: run.id,
            payment_id: paymentId,
            ...result,
          },
        });
        counters.total_checked += 1;
        if (result.status === "matched") counters.matched_count += 1;
        if (result.status === "mismatched") counters.mismatched_count += 1;
        if (result.status === "incomplete") counters.incomplete_count += 1;
        if (result.status === "needs_review") counters.needs_review_count += 1;
        if (result.details?.error) counters.error_count += 1;
      } catch (error) {
        counters.error_count += 1;
        console.error("Could not save reconciliation record:", {
          paymentId,
          message: error.message,
        });
      }
    }

    const hasErrors =
      counters.error_count > 0 ||
      counters.mismatched_count > 0 ||
      counters.needs_review_count > 0;
    return await prismaClient.reconciliation_run.update({
      where: { id: run.id },
      data: {
        ...counters,
        status: hasErrors ? "completed_with_errors" : "completed",
        completed_at: new Date(),
      },
    });
  } catch (error) {
    if (run) {
      await prismaClient.reconciliation_run.update({
        where: { id: run.id },
        data: { status: "failed", completed_at: new Date() },
      });
    }
    throw error;
  } finally {
    reconciliationRunning = false;
  }
};

export const listReconciliations = (where, cursor, limit, prismaClient = prisma) =>
  prismaClient.reconciliation_record.findMany({
    where,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

export const findReconciliationCursor = (cursor, where, prismaClient = prisma) =>
  prismaClient.reconciliation_record.findFirst({
    where: { id: cursor, ...where },
    select: { id: true },
  });

export const listRuns = (where, cursor, limit, prismaClient = prisma) =>
  prismaClient.reconciliation_run.findMany({
    where,
    orderBy: [{ started_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

export const findRunCursor = (cursor, where, prismaClient = prisma) =>
  prismaClient.reconciliation_run.findFirst({
    where: { id: cursor, ...where },
    select: { id: true },
  });
