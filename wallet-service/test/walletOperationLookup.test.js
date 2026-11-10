import test from "node:test";
import assert from "node:assert/strict";
import internalAuth from "../middleware/internalAuth.js";
import {
  listWalletOperationsByPayment,
  paymentIdQuerySchema,
} from "../service/walletOperationLookup.js";

const paymentId = "a0b1c2d3-e4f5-4678-9012-3456789abcde";
const createdAt = new Date("2026-11-07T10:00:00.000Z");

const runMiddleware = (middleware, headers, secret) => {
  const req = { headers };
  const result = {
    statusCode: undefined,
    body: undefined,
    nextCalled: false,
  };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };

  process.env.INTERNAL_API_SECRET = secret;
  middleware(req, res, () => {
    result.nextCalled = true;
  });
  return result;
};

test("valid payment ID returns reserve and credit operation details", async () => {
  const records = [
    {
      id: "reserve-id",
      payment_id: paymentId,
      wallet_id: "sender-wallet",
      amount: 12500n,
      operation: "reserve",
      status: "committed",
      created_at: createdAt,
    },
    {
      id: "credit-id",
      payment_id: paymentId,
      wallet_id: "receiver-wallet",
      amount: 12500n,
      operation: "credit",
      status: "committed",
      created_at: createdAt,
    },
  ];
  const fakePrisma = {
    wallet_operation: {
      async findMany(args) {
        assert.deepEqual(args.where, { payment_id: paymentId });
        return records;
      },
    },
  };

  assert.deepEqual(paymentIdQuerySchema.safeParse({ paymentId }).success, true);
  assert.deepEqual(await listWalletOperationsByPayment(fakePrisma, paymentId), [
    {
      operation_id: "reserve-id",
      payment_id: paymentId,
      wallet_id: "sender-wallet",
      amount: "12500",
      operation: "reserve",
      status: "committed",
      created_at: createdAt,
    },
    {
      operation_id: "credit-id",
      payment_id: paymentId,
      wallet_id: "receiver-wallet",
      amount: "12500",
      operation: "credit",
      status: "committed",
      created_at: createdAt,
    },
  ]);
});

test("payment with no wallet operations returns an empty list", async () => {
  const fakePrisma = {
    wallet_operation: {
      async findMany() {
        return [];
      },
    },
  };
  assert.deepEqual(await listWalletOperationsByPayment(fakePrisma, paymentId), []);
});

test("invalid payment UUID fails validation", () => {
  assert.equal(paymentIdQuerySchema.safeParse({ paymentId: "not-a-uuid" }).success, false);
});

test("internal authentication rejects missing or invalid secrets and accepts valid secret", () => {
  assert.equal(runMiddleware(internalAuth, {}, "expected").statusCode, 401);
  assert.equal(
    runMiddleware(internalAuth, { "x-internal-secret": "wrong" }, "expected").statusCode,
    401,
  );
  assert.equal(
    runMiddleware(internalAuth, { "x-internal-secret": "expected" }, "expected").nextCalled,
    true,
  );
});
