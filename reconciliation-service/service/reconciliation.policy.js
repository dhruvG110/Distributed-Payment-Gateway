import { z } from "zod";

const positiveIntegerString = z.string().regex(/^[1-9]\d*$/);
const uuid = z.string().uuid();

export const runRequestSchema = z
  .object({
    payment_ids: z.array(uuid).min(1).max(100),
  })
  .strict();

export const paymentIdSchema = uuid;

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: uuid.optional(),
    status: z.enum(["matched", "mismatched", "incomplete", "needs_review"]).optional(),
  })
  .strict();

export const runListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: uuid.optional(),
    status: z.enum(["running", "completed", "completed_with_errors", "failed"]).optional(),
  })
  .strict();

export const paymentResponseSchema = z.object({
  id: uuid,
  sender_wallet_id: uuid,
  receiver_wallet_id: uuid,
  amount: positiveIntegerString,
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["pending", "processing", "succeeded", "failed", "reversed", "cancelled"]),
});

const walletOperationSchema = z.object({
  operation_id: uuid,
  payment_id: uuid,
  wallet_id: uuid,
  amount: positiveIntegerString,
  operation: z.enum(["reserve", "credit"]),
  status: z.string().min(1),
  created_at: z.string().datetime().or(z.date()),
});

export const walletResponseSchema = z.object({
  success: z.literal(true),
  operations: z.array(walletOperationSchema),
});

const ledgerEntrySchema = z.object({
  id: uuid,
  wallet_id: uuid,
  entry_type: z.enum(["debit", "credit"]),
  amount: positiveIntegerString,
  currency: z.string().regex(/^[A-Z]{3}$/),
  created_at: z.string().datetime().or(z.date()),
});

export const ledgerResponseSchema = z.object({
  success: z.literal(true),
  transaction: z.object({
    id: uuid,
    payment_id: uuid,
    amount: positiveIntegerString,
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.string().min(1),
    created_at: z.string().datetime().or(z.date()),
    entries: z.array(ledgerEntrySchema),
  }),
});

const equalBigInt = (left, right) => BigInt(left) === BigInt(right);

const mismatch = (reasons, reason) => reasons.push(reason);

export const evaluatePayment = ({ payment, operations, transaction }) => {
  const reasons = [];
  const details = {
    payment_status: payment.status,
    wallet_operations: operations,
    ledger_transaction: transaction,
  };
  const reserveOperations = operations.filter((item) => item.operation === "reserve");
  const creditOperations = operations.filter((item) => item.operation === "credit");

  if (reserveOperations.length > 1 || creditOperations.length > 1) {
    mismatch(reasons, "Duplicate wallet operations were returned");
  }
  const reserve = reserveOperations[0];
  const credit = creditOperations[0];
  let ledgerDebit = 0n;
  let ledgerCredit = 0n;
  const ledgerEntries = transaction?.entries ?? [];
  const debitEntries = ledgerEntries.filter((entry) => entry.entry_type === "debit");
  const creditEntries = ledgerEntries.filter((entry) => entry.entry_type === "credit");
  for (const entry of debitEntries) ledgerDebit += BigInt(entry.amount);
  for (const entry of creditEntries) ledgerCredit += BigInt(entry.amount);

  if (payment.status === "processing" || payment.status === "pending") {
    return {
      status: reasons.length ? "mismatched" : "incomplete",
      mismatch_reason: reasons.length
        ? reasons.join("; ")
        : "Payment has not reached a terminal state",
      expected_amount: BigInt(payment.amount),
      wallet_debit: reserve ? BigInt(reserve.amount) : null,
      wallet_credit: credit ? BigInt(credit.amount) : null,
      ledger_debit: transaction ? ledgerDebit : null,
      ledger_credit: transaction ? ledgerCredit : null,
      details,
    };
  }

  if (payment.status === "succeeded") {
    if (!reserve || !credit || !transaction) {
      return {
        status: "incomplete",
        mismatch_reason: "Successful payment is missing a required wallet or ledger record",
        expected_amount: BigInt(payment.amount),
        wallet_debit: reserve ? BigInt(reserve.amount) : null,
        wallet_credit: credit ? BigInt(credit.amount) : null,
        ledger_debit: transaction ? ledgerDebit : null,
        ledger_credit: transaction ? ledgerCredit : null,
        details,
      };
    }

    if (
      reserve.wallet_id !== payment.sender_wallet_id ||
      credit.wallet_id !== payment.receiver_wallet_id
    ) mismatch(reasons, "Wallet operation wallet ID does not match the payment");
    if (
      !equalBigInt(reserve.amount, payment.amount) ||
      !equalBigInt(credit.amount, payment.amount)
    ) mismatch(reasons, "Wallet operation amount does not match the payment");
    if (reserve.status !== "committed" || credit.status !== "committed") {
      mismatch(reasons, "Wallet reserve and credit operations must both be committed");
    }
    if (
      transaction.payment_id !== payment.id ||
      !equalBigInt(transaction.amount, payment.amount) ||
      transaction.currency !== payment.currency ||
      transaction.status !== "posted"
    ) mismatch(reasons, "Ledger transaction does not match the successful payment");
    if (
      debitEntries.length !== 1 ||
      creditEntries.length !== 1 ||
      debitEntries[0]?.wallet_id !== payment.sender_wallet_id ||
      creditEntries[0]?.wallet_id !== payment.receiver_wallet_id ||
      debitEntries.some(
        (entry) =>
          !equalBigInt(entry.amount, payment.amount) ||
          entry.currency !== payment.currency,
      ) ||
      creditEntries.some(
        (entry) =>
          !equalBigInt(entry.amount, payment.amount) ||
          entry.currency !== payment.currency,
      ) ||
      ledgerDebit !== ledgerCredit
    ) mismatch(reasons, "Ledger debit and credit entries are missing, unbalanced, or inconsistent");

    return {
      status: reasons.length ? "mismatched" : "matched",
      mismatch_reason: reasons.length ? reasons.join("; ") : null,
      expected_amount: BigInt(payment.amount),
      wallet_debit: BigInt(reserve.amount),
      wallet_credit: BigInt(credit.amount),
      ledger_debit: ledgerDebit,
      ledger_credit: ledgerCredit,
      details,
    };
  }

  // Failed/cancelled/reversed payments are never presumed refunded from a missing record.
  if (!reserve) {
    return {
      status: "needs_review",
      mismatch_reason: "No sender reserve record exists to verify the payment lifecycle",
      expected_amount: BigInt(payment.amount),
      wallet_debit: null,
      wallet_credit: credit ? BigInt(credit.amount) : null,
      ledger_debit: transaction ? ledgerDebit : null,
      ledger_credit: transaction ? ledgerCredit : null,
      details,
    };
  }
  if (
    reserve.wallet_id !== payment.sender_wallet_id ||
    !equalBigInt(reserve.amount, payment.amount)
  ) mismatch(reasons, "Sender reserve does not match the payment");
  if (reserve.status !== "released") {
    mismatch(reasons, "Terminal unsuccessful payment has a reserve that was not released");
  }
  if (credit || transaction || ledgerEntries.length > 0) {
    mismatch(reasons, "Terminal unsuccessful payment has receiver credit or ledger entries");
  }

  return {
    status: reasons.length ? "needs_review" : "matched",
    mismatch_reason: reasons.length ? reasons.join("; ") : null,
    expected_amount: BigInt(payment.amount),
    wallet_debit: BigInt(reserve.amount),
    wallet_credit: credit ? BigInt(credit.amount) : null,
    ledger_debit: transaction ? ledgerDebit : null,
    ledger_credit: transaction ? ledgerCredit : null,
    details,
  };
};
