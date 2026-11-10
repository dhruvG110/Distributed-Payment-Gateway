import { z } from "zod";

export const paymentIdQuerySchema = z
  .object({
    paymentId: z.string().uuid(),
  })
  .strict();

export const listWalletOperationsByPayment = async (prisma, paymentId) => {
  const operations = await prisma.wallet_operation.findMany({
    where: { payment_id: paymentId },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      payment_id: true,
      wallet_id: true,
      amount: true,
      operation: true,
      status: true,
      created_at: true,
    },
  });

  return operations.map((operation) => ({
    operation_id: operation.id,
    payment_id: operation.payment_id,
    wallet_id: operation.wallet_id,
    amount: operation.amount.toString(),
    operation: operation.operation,
    status: operation.status,
    created_at: operation.created_at,
  }));
};
