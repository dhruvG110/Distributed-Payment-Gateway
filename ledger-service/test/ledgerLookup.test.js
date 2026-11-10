import test from "node:test";
import assert from "node:assert/strict";
import internalAuth from "../middleware/internalAuth.js";
import {
  findLedgerTransactionByPayment,
  paymentIdQuerySchema,
} from "../service/ledgerLookup.js";

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

test("missing ledger transaction returns null", async () => {
  const fakePrisma = {
    ledger_transaction: {
      async findUnique(args) {
        assert.deepEqual(args.where, { payment_id: paymentId });
        return null;
      },
    },
  };
  assert.equal(await findLedgerTransactionByPayment(fakePrisma, paymentId), null);
});

test("valid transaction includes actual debit and credit entries as integer strings", async () => {
  const fakePrisma = {
    ledger_transaction: {
      async findUnique(args) {
        assert.deepEqual(args.where, { payment_id: paymentId });
        assert.deepEqual(args.include, { entries: true });
        return {
          id: "transaction-id",
          payment_id: paymentId,
          amount: 12500n,
          currency: "INR",
          status: "posted",
          created_at: createdAt,
          entries: [
            {
              id: "debit-id",
              wallet_id: "sender-wallet",
              entry_type: "debit",
              amount: 12500n,
              currency: "INR",
              created_at: createdAt,
            },
            {
              id: "credit-id",
              wallet_id: "receiver-wallet",
              entry_type: "credit",
              amount: 12500n,
              currency: "INR",
              created_at: createdAt,
            },
          ],
        };
      },
    },
  };

  assert.equal(paymentIdQuerySchema.safeParse({ paymentId }).success, true);
  assert.deepEqual(await findLedgerTransactionByPayment(fakePrisma, paymentId), {
    id: "transaction-id",
    payment_id: paymentId,
    amount: "12500",
    currency: "INR",
    status: "posted",
    created_at: createdAt,
    entries: [
      {
        id: "debit-id",
        wallet_id: "sender-wallet",
        entry_type: "debit",
        amount: "12500",
        currency: "INR",
        created_at: createdAt,
      },
      {
        id: "credit-id",
        wallet_id: "receiver-wallet",
        entry_type: "credit",
        amount: "12500",
        currency: "INR",
        created_at: createdAt,
      },
    ],
  });
});

test("invalid payment UUID fails validation", () => {
  assert.equal(paymentIdQuerySchema.safeParse({ paymentId: "bad-id" }).success, false);
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
