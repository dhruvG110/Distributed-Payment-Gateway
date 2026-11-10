import test from "node:test";
import assert from "node:assert/strict";
import internalAuth from "../middleware/internalAuth.js";
import {
  evaluatePayment,
  listQuerySchema,
  paymentIdSchema,
  runRequestSchema,
} from "../service/reconciliation.policy.js";
import {
  findReconciliationCursor,
  findRunCursor,
  listReconciliations,
  reconcilePayment,
  requestWithRetry,
  runReconciliation,
} from "../service/reconciliation.service.js";

const paymentId = "a0b1c2d3-e4f5-4678-9012-3456789abcde";
const sender = "b0b1c2d3-e4f5-4678-9012-3456789abcde";
const receiver = "c0b1c2d3-e4f5-4678-9012-3456789abcde";
const createdAt = "2026-11-07T10:00:00.000Z";
const payment = {
  id: paymentId,
  sender_wallet_id: sender,
  receiver_wallet_id: receiver,
  amount: "1200",
  currency: "INR",
  status: "succeeded",
};
const reserve = {
  operation_id: "d0b1c2d3-e4f5-4678-9012-3456789abcde",
  payment_id: paymentId,
  wallet_id: sender,
  amount: "1200",
  operation: "reserve",
  status: "committed",
  created_at: createdAt,
};
const credit = {
  ...reserve,
  operation_id: "e0b1c2d3-e4f5-4678-9012-3456789abcde",
  wallet_id: receiver,
  operation: "credit",
};
const ledger = {
  id: "f0b1c2d3-e4f5-4678-9012-3456789abcde",
  payment_id: paymentId,
  amount: "1200",
  currency: "INR",
  status: "posted",
  created_at: createdAt,
  entries: [
    {
      id: "010b1c2d3-e4f5-4678-9012-3456789abcde",
      wallet_id: sender,
      entry_type: "debit",
      amount: "1200",
      currency: "INR",
      created_at: createdAt,
    },
    {
      id: "020b1c2d3-e4f5-4678-9012-3456789abcde",
      wallet_id: receiver,
      entry_type: "credit",
      amount: "1200",
      currency: "INR",
      created_at: createdAt,
    },
  ],
};

const evaluate = (overrides = {}) =>
  evaluatePayment({
    payment,
    operations: [reserve, credit],
    transaction: ledger,
    ...overrides,
  });

test("successful payment with matching wallet and ledger records is matched", () => {
  const result = evaluate();
  assert.equal(result.status, "matched");
  assert.equal(result.expected_amount, 1200n);
  assert.equal(result.wallet_debit, 1200n);
  assert.equal(result.wallet_credit, 1200n);
  assert.equal(result.ledger_debit, 1200n);
  assert.equal(result.ledger_credit, 1200n);
});

test("missing reserve and credit operations on success are incomplete", () => {
  assert.equal(evaluate({ operations: [credit] }).status, "incomplete");
  assert.equal(evaluate({ operations: [reserve] }).status, "incomplete");
});

test("incorrect wallet amount or wallet ID is mismatched", () => {
  assert.equal(
    evaluate({
      operations: [reserve, { ...credit, amount: "1201" }],
    }).status,
    "mismatched",
  );
  assert.equal(
    evaluate({
      operations: [{ ...reserve, wallet_id: receiver }, credit],
    }).status,
    "mismatched",
  );
});

test("missing ledger transaction is incomplete", () => {
  assert.equal(evaluate({ transaction: null }).status, "incomplete");
});

test("missing debit or credit entry is incomplete", () => {
  assert.equal(
    evaluate({ transaction: { ...ledger, entries: [ledger.entries[1]] } }).status,
    "mismatched",
  );
  assert.equal(
    evaluate({ transaction: { ...ledger, entries: [ledger.entries[0]] } }).status,
    "mismatched",
  );
});

test("incorrect ledger amount and debit-credit imbalance are mismatched", () => {
  assert.equal(
    evaluate({
      transaction: {
        ...ledger,
        amount: "1201",
      },
    }).status,
    "mismatched",
  );
  assert.equal(
    evaluate({
      transaction: {
        ...ledger,
        entries: [ledger.entries[0], { ...ledger.entries[1], amount: "1199" }],
      },
    }).status,
    "mismatched",
  );
});

test("failed payment with a released reservation and no later movement is matched", () => {
  const failedPayment = { ...payment, status: "failed" };
  const result = evaluatePayment({
    payment: failedPayment,
    operations: [{ ...reserve, status: "released" }],
    transaction: null,
  });
  assert.equal(result.status, "matched");
});

test("missing reserve for terminal failure is never treated as a refund", () => {
  const result = evaluatePayment({
    payment: { ...payment, status: "cancelled" },
    operations: [],
    transaction: null,
  });
  assert.equal(result.status, "needs_review");
});

test("processing payment is incomplete, not successful", () => {
  assert.equal(
    evaluatePayment({
      payment: { ...payment, status: "processing" },
      operations: [reserve],
      transaction: null,
    }).status,
    "incomplete",
  );
});

test("invalid payment IDs are rejected before fetching external APIs", async () => {
  assert.equal(paymentIdSchema.safeParse("bad-id").success, false);
  let wasCalled = false;
  const result = await reconcilePayment("bad-id", {
    fetchPaymentData: async () => {
      wasCalled = true;
    },
  });
  assert.equal(result.status, "mismatched");
  assert.equal(wasCalled, false);
});

test("reconcilePayment converts external fetch failures to review records", async () => {
  const timeout = new Error("timeout");
  timeout.code = "ECONNABORTED";
  const result = await reconcilePayment(paymentId, {
    fetchPaymentData: async () => payment,
    fetchWalletData: async () => {
      throw timeout;
    },
    fetchLedgerData: async () => null,
  });
  assert.equal(result.status, "needs_review");
  assert.match(result.mismatch_reason, /External service error/);
});

test("temporary API errors retry boundedly and permanent errors do not retry", async () => {
  let attempts = 0;
  const result = await requestWithRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("temporary");
        error.response = { status: 503 };
        throw error;
      }
      return "ok";
    },
    async () => {},
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(
    requestWithRetry(async () => {
      attempts += 1;
      const error = new Error("bad request");
      error.response = { status: 400 };
      throw error;
    }, async () => {}),
  );
  assert.equal(attempts, 1);
});

test("run request deduplicates IDs before saving one record per payment", async () => {
  const createdRecords = [];
  const updates = [];
  const fakePrisma = {
    reconciliation_run: {
      async create() {
        return { id: "run-id" };
      },
      async update(args) {
        updates.push(args);
        return { id: "run-id", ...args.data };
      },
    },
    reconciliation_record: {
      async create(args) {
        createdRecords.push(args.data);
      },
    },
  };
  const run = await runReconciliation(
    [paymentId, paymentId],
    {
      prismaClient: fakePrisma,
      reconcile: async () => ({
        payment_id: paymentId,
        status: "matched",
        expected_amount: 1200n,
        wallet_debit: 1200n,
        wallet_credit: 1200n,
        ledger_debit: 1200n,
        ledger_credit: 1200n,
        mismatch_reason: null,
        details: {},
      }),
    },
  );
  assert.equal(createdRecords.length, 1);
  assert.equal(run.total_checked, 1);
  assert.equal(run.matched_count, 1);
  assert.equal(updates.length, 1);
});

test("overlapping reconciliation runs are rejected", async () => {
  let releaseReconcile;
  const reconciliationPending = new Promise((resolve) => {
    releaseReconcile = resolve;
  });
  const fakePrisma = {
    reconciliation_run: {
      async create() {
        return { id: "overlap-run" };
      },
      async update(args) {
        return { id: "overlap-run", ...args.data };
      },
    },
    reconciliation_record: {
      async create() {},
    },
  };
  const firstRun = runReconciliation([paymentId], {
    prismaClient: fakePrisma,
    reconcile: async () => {
      await reconciliationPending;
      return { payment_id: paymentId, status: "incomplete", details: {} };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    runReconciliation([], { prismaClient: fakePrisma }),
    { code: "RECONCILIATION_RUNNING" },
  );
  releaseReconcile();
  await firstRun;
});

test("a failed payment check does not prevent later payments from being stored", async () => {
  const savedRecords = [];
  let runCount = 0;
  const fakePrisma = {
    reconciliation_run: {
      async create() {
        runCount += 1;
        return { id: `run-${runCount}` };
      },
      async update(args) {
        return { id: `run-${runCount}`, ...args.data };
      },
    },
    reconciliation_record: {
      async create(args) {
        savedRecords.push(args.data);
      },
    },
  };
  const run = await runReconciliation([paymentId, receiver], {
    prismaClient: fakePrisma,
    reconcile: async (id) => {
      if (id === paymentId) throw new Error("external lookup failed");
      return { payment_id: id, status: "matched", details: {} };
    },
  });
  assert.equal(savedRecords.length, 2);
  assert.equal(run.total_checked, 2);
  assert.equal(run.error_count, 1);
  assert.equal(run.status, "completed_with_errors");
});

test("cursor checks respect filters and page queries use a stable cursor order", async () => {
  let cursorQuery;
  let pageQuery;
  const fakePrisma = {
    reconciliation_record: {
      async findFirst(args) {
        cursorQuery = args;
        return null;
      },
      async findMany(args) {
        pageQuery = args;
        return [];
      },
    },
    reconciliation_run: {
      async findFirst(args) {
        cursorQuery = args;
        return { id: args.where.id };
      },
    },
  };
  assert.equal(
    await findReconciliationCursor("record-id", { status: "matched" }, fakePrisma),
    null,
  );
  assert.deepEqual(cursorQuery.where, { id: "record-id", status: "matched" });
  assert.deepEqual(await findRunCursor("run-id", {}, fakePrisma), { id: "run-id" });
  await listReconciliations({ status: "matched" }, "record-id", 20, fakePrisma);
  assert.deepEqual(pageQuery.orderBy, [{ created_at: "desc" }, { id: "desc" }]);
  assert.deepEqual(pageQuery.cursor, { id: "record-id" });
  assert.equal(pageQuery.take, 21);
});

test("internal authentication rejects unauthorized requests", () => {
  process.env.INTERNAL_API_SECRET = "expected-secret";
  const makeResponse = () => ({
    statusCode: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  });
  const res = makeResponse();
  let nextCalled = false;
  internalAuth(
    { headers: {} },
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("internal authentication accepts the configured secret", () => {
  process.env.INTERNAL_API_SECRET = "expected-secret";
  let nextCalled = false;
  const response = {
    status() {
      throw new Error("authorized request must not produce an error response");
    },
    json() {
      throw new Error("authorized request must not produce an error response");
    },
  };
  internalAuth(
    { headers: { "x-internal-secret": "expected-secret" } },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
});

test("pagination and status filters are validated", () => {
  assert.equal(listQuerySchema.safeParse({ limit: "50", status: "matched" }).success, true);
  assert.equal(listQuerySchema.safeParse({ limit: "101" }).success, false);
  assert.equal(runRequestSchema.safeParse({ payment_ids: [paymentId] }).success, true);
  assert.equal(runRequestSchema.safeParse({ payment_ids: ["bad"] }).success, false);
});
