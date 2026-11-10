
import prisma from "../db.js";
import { randomUUID } from "node:crypto";

const LOCK_DURATION = 30000;

export const acquireLock = async (paymentId) => {
  const lockOwner = randomUUID();
  const now = new Date();

  const availableLock = {
    OR: [
      {
        AND: [
          { locked_by: null },
          { locked_until: null },
        ],
      },
      {
        locked_until: {
          lte: now,
        },
      },
    ],
  };

  const result = await prisma.payment.updateMany({
    where: {
      id: paymentId,
      OR: [
        {
          status: "pending",
          ...availableLock,
        },
        {
          status: "processing",
          ...availableLock,
        },
      ],
    },
    data: {
      status: "processing",
      locked_by: lockOwner,
      locked_until: new Date(now.getTime() + LOCK_DURATION),
    },
  });

  if (result.count !== 1) {
    return null;
  }

  return lockOwner;
};

export const renewLock = async (paymentId, lockOwner) => {
  const now = new Date();

  const result = await prisma.payment.updateMany({
    where: {
      id: paymentId,
      locked_by: lockOwner,
      status: "processing",
      locked_until: {
        gt: now,
      },
    },
    data: {
      locked_until: new Date(now.getTime() + LOCK_DURATION),
    },
  });

  return result.count === 1;
};

export const releaseLock = async (paymentId, lockOwner) => {
  const result = await prisma.payment.updateMany({
    where: {
      id: paymentId,
      locked_by: lockOwner,
    },
    data: {
      locked_by: null,
      locked_until: null,
    },
  });

  return result.count === 1;
};
