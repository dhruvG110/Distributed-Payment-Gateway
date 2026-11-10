import { z } from "zod";

export const paymentIdQuerySchema = z
  .object({
    paymentId: z.string().uuid(),
  })
  .strict();

export const findLedgerTransactionByPayment = async (prisma, paymentId) => {
  const transaction = await prisma.ledger_transaction.findUnique({
    where: { payment_id: paymentId },
    include: { entries: true },
  });

  if (!transaction) {
    return null;
  }

  return {
    id: transaction.id,
    payment_id: transaction.payment_id,
    amount: transaction.amount.toString(),
    currency: transaction.currency,
    status: transaction.status,
    created_at: transaction.created_at,
    entries: transaction.entries.map((entry) => ({
      id: entry.id,
      wallet_id: entry.wallet_id,
      entry_type: entry.entry_type,
      amount: entry.amount.toString(),
      currency: entry.currency,
      created_at: entry.created_at,
    })),
  };
};
