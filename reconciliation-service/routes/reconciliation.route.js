import express from "express";
import prisma from "../db.js";
import internalAuth from "../middleware/internalAuth.js";
import {
  listQuerySchema,
  paymentIdSchema,
  runListQuerySchema,
  runRequestSchema,
} from "../service/reconciliation.policy.js";
import {
  findReconciliationCursor,
  findRunCursor,
  listReconciliations,
  listRuns,
  reconcilePayment,
  runReconciliation,
} from "../service/reconciliation.service.js";

const router = express.Router();

const serializeAmounts = (record) => ({
  ...record,
  expected_amount: record.expected_amount?.toString() ?? null,
  wallet_debit: record.wallet_debit?.toString() ?? null,
  wallet_credit: record.wallet_credit?.toString() ?? null,
  ledger_debit: record.ledger_debit?.toString() ?? null,
  ledger_credit: record.ledger_credit?.toString() ?? null,
});

router.post("/run", internalAuth, async (req, res) => {
  const validation = runRequestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid reconciliation request",
      errors: validation.error.issues,
    });
  }

  try {
    const run = await runReconciliation(validation.data.payment_ids);
    return res.status(201).json({
      success: true,
      message: "Reconciliation run completed",
      run,
    });
  } catch (error) {
    if (error.code === "RECONCILIATION_RUNNING") {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error("Could not run reconciliation:", error);
    return res.status(500).json({
      success: false,
      message: "Could not run reconciliation",
    });
  }
});

router.get("/", internalAuth, async (req, res) => {
  const validation = listQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid reconciliation query",
      errors: validation.error.issues,
    });
  }

  try {
    const { limit, cursor, status } = validation.data;
    const where = status ? { status } : {};
    if (
      cursor &&
      !(await findReconciliationCursor(cursor, where))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid reconciliation cursor",
      });
    }
    const records = await listReconciliations(where, cursor, limit);
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    return res.status(200).json({
      success: true,
      records: page.map(serializeAmounts),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Could not fetch reconciliation records:", error);
    return res.status(500).json({
      success: false,
      message: "Could not fetch reconciliation records",
    });
  }
});

router.get("/mismatches", internalAuth, async (req, res) => {
  const validation = listQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid reconciliation query",
      errors: validation.error.issues,
    });
  }

  try {
    const { limit, cursor } = validation.data;
    const where = { status: { in: ["mismatched", "needs_review"] } };
    if (cursor && !(await findReconciliationCursor(cursor, where))) {
      return res.status(400).json({
        success: false,
        message: "Invalid reconciliation cursor",
      });
    }
    const records = await listReconciliations(where, cursor, limit);
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    return res.status(200).json({
      success: true,
      records: page.map(serializeAmounts),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Could not fetch reconciliation mismatches:", error);
    return res.status(500).json({
      success: false,
      message: "Could not fetch reconciliation mismatches",
    });
  }
});

router.get("/runs", internalAuth, async (req, res) => {
  const validation = runListQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid reconciliation run query",
      errors: validation.error.issues,
    });
  }

  try {
    const { limit, cursor, status } = validation.data;
    const where = status ? { status } : {};
    if (cursor && !(await findRunCursor(cursor, where))) {
      return res.status(400).json({
        success: false,
        message: "Invalid reconciliation run cursor",
      });
    }
    const runs = await listRuns(where, cursor, limit);
    const hasMore = runs.length > limit;
    const page = hasMore ? runs.slice(0, limit) : runs;
    return res.status(200).json({
      success: true,
      runs: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Could not fetch reconciliation runs:", error);
    return res.status(500).json({
      success: false,
      message: "Could not fetch reconciliation runs",
    });
  }
});

router.get("/runs/:id", internalAuth, async (req, res) => {
  const validation = paymentIdSchema.safeParse(req.params.id);
  if (!validation.success) {
    return res.status(400).json({ success: false, message: "Invalid run ID" });
  }
  try {
    const run = await prisma.reconciliation_run.findUnique({
      where: { id: validation.data },
      include: { records: true },
    });
    if (!run) {
      return res.status(404).json({ success: false, message: "Run not found" });
    }
    return res.status(200).json({
      success: true,
      run: {
        ...run,
        records: run.records.map(serializeAmounts),
      },
    });
  } catch (error) {
    console.error("Could not fetch reconciliation run:", error);
    return res.status(500).json({
      success: false,
      message: "Could not fetch reconciliation run",
    });
  }
});

router.get("/:id", internalAuth, async (req, res) => {
  const validation = paymentIdSchema.safeParse(req.params.id);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid reconciliation record ID",
    });
  }
  try {
    const record = await prisma.reconciliation_record.findUnique({
      where: { id: validation.data },
    });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Reconciliation record not found",
      });
    }
    return res.status(200).json({
      success: true,
      record: serializeAmounts(record),
    });
  } catch (error) {
    console.error("Could not fetch reconciliation record:", error);
    return res.status(500).json({
      success: false,
      message: "Could not fetch reconciliation record",
    });
  }
});

export default router;
