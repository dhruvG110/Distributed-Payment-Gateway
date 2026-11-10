import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDuePaymentsWhere,
  canCancelWithoutWalletRelease,
  getRetryDecision,
  retryDelays,
} from "../service/paymentSafety.js";
import { runWithDeadline } from "../service/shutdownDeadline.js";

test("due-payment query includes recoverable pending payments and due retries", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const where = buildDuePaymentsWhere(now);

  assert.equal(where.OR.length, 2);
  assert.equal(where.OR[0].status, "pending");
  assert.deepEqual(where.OR[0].OR, [
    { locked_until: null },
    { locked_until: { lte: now } },
  ]);
  assert.equal(where.OR[1].status, "processing");
  assert.deepEqual(where.OR[1].next_retry_at, { not: null, lte: now });
});

test("retry decisions preserve existing delays and safely hold exhausted money movement", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const scheduled = getRetryDecision({
    retryable: true,
    nextRetryCount: 2,
    currentStep: "reserve",
    now,
  });
  assert.equal(scheduled.status, "processing");
  assert.equal(scheduled.nextRetryAt.getTime(), now.getTime() + retryDelays[1]);
  assert.equal(scheduled.requiresReconciliation, false);

  const safeFailure = getRetryDecision({
    retryable: false,
    nextRetryCount: 1,
    currentStep: null,
    now,
  });
  assert.equal(safeFailure.status, "failed");
  assert.equal(safeFailure.nextRetryAt, null);

  for (const currentStep of ["reserve", "ledger", "credit", "commit"]) {
    const unresolved = getRetryDecision({
      retryable: false,
      nextRetryCount: 1,
      currentStep,
      now,
    });
    assert.equal(unresolved.status, "processing");
    assert.equal(unresolved.nextRetryAt, null);
    assert.equal(unresolved.requiresReconciliation, true);
  }
});

test("cancellation is limited to before the reserve request can start", () => {
  assert.equal(canCancelWithoutWalletRelease(null), true);
  assert.equal(canCancelWithoutWalletRelease("validation"), true);
  for (const currentStep of ["reserve", "ledger", "credit", "commit"]) {
    assert.equal(canCancelWithoutWalletRelease(currentStep), false);
  }
});

test("shutdown deadline reports completion before timeout", async () => {
  const result = await runWithDeadline(Promise.resolve("done"), 100, () => {
    assert.fail("timeout callback should not run");
  });

  assert.deepEqual(result, { timedOut: false, value: "done" });
});

test("shutdown deadline invokes timeout callback when work does not finish", async () => {
  let timedOut = false;
  const result = await runWithDeadline(
    new Promise((resolve) => setTimeout(resolve, 30)),
    5,
    () => {
      timedOut = true;
    },
  );

  assert.deepEqual(result, { timedOut: true });
  assert.equal(timedOut, true);
});
