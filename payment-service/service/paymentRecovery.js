
import axios from "axios";

// Inspect Wallet and Ledger state
export const inspectPaymentState = async (payment) => {
  const {
    id: paymentId,
    sender_wallet_id,
    receiver_wallet_id,
    amount,
    currency,
  } = payment;

  // 1. Fetch wallet operations
  const walletResponse = await axios.get(
    `${process.env.WALLET_SERVICE_URL}/api/wallet/internal/operations/`,
    {
      params: { paymentId },
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET,
      },
      timeout: 5000,
    }
  );

  const walletOperations = walletResponse.data.operations;

  // 2. Fetch ledger transaction
  let ledgerTransaction = null;

  try {
    const ledgerResponse = await axios.get(
      `${process.env.LEDGER_SERVICE_URL}/api/ledger/internal/`,
      {
        params: { paymentId },
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET,
        },
        timeout: 5000,
      }
    );

    ledgerTransaction = ledgerResponse.data.transaction;

    if (!ledgerTransaction) {
      throw new Error("Ledger transaction missing from response");
    }
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }
  }

  // 3. Validate wallet operations
  if (!Array.isArray(walletOperations)) {
    throw new Error("Invalid wallet operations data");
  }

  const allowedOperations = ["reserve", "credit"];
  const allowedStatuses = ["reserved", "committed", "released"];

  for (const operation of walletOperations) {
    if (
      !operation ||
      operation.payment_id !== paymentId ||
      !allowedOperations.includes(operation.operation) ||
      !allowedStatuses.includes(operation.status)
    ) {
      throw new Error("Invalid wallet operation detected");
    }

    if (
      typeof operation.wallet_id !== "string" ||
      String(operation.amount) !== String(amount)
    ) {
      throw new Error("Invalid wallet operation details");
    }
  }

  // 4. Separate operations
  const reserveOperations = walletOperations.filter(
    (operation) => operation.operation === "reserve"
  );

  const creditOperations = walletOperations.filter(
    (operation) => operation.operation === "credit"
  );

  // 5. Prevent duplicates
  if (
    reserveOperations.length > 1 ||
    creditOperations.length > 1
  ) {
    throw new Error("Duplicate wallet operations detected");
  }

  const reserveOperation = reserveOperations[0] ?? null;
  const creditOperation = creditOperations[0] ?? null;

  // 6. Validate sender reservation
  if (reserveOperation) {
    if (
      reserveOperation.wallet_id !== sender_wallet_id ||
      reserveOperation.status === "released"
    ) {
      throw new Error("Sender reservation does not match payment");
    }
  }

  // 7. Validate receiver credit
  if (creditOperation) {
    if (
      creditOperation.wallet_id !== receiver_wallet_id ||
      creditOperation.status !== "committed"
    ) {
      throw new Error("Receiver credit does not match payment");
    }
  }

  // 8. Validate ledger transaction
  if (ledgerTransaction !== null) {
    if (
      ledgerTransaction.payment_id !== paymentId ||
      ledgerTransaction.status !== "posted"
    ) {
      throw new Error("Invalid ledger transaction detected");
    }

    if (!Array.isArray(ledgerTransaction.entries)) {
      throw new Error("Invalid ledger entries");
    }

    if (ledgerTransaction.entries.length !== 2) {
      throw new Error("Ledger must contain exactly two entries");
    }

    const debitEntries = ledgerTransaction.entries.filter(
      (entry) => entry.entry_type === "debit"
    );

    const creditEntries = ledgerTransaction.entries.filter(
      (entry) => entry.entry_type === "credit"
    );

    if (
      debitEntries.length !== 1 ||
      creditEntries.length !== 1
    ) {
      throw new Error("Ledger entries are not balanced");
    }

    const debit = debitEntries[0];
    const credit = creditEntries[0];

    // Verify debit and credit consistency
    if (
      String(debit.amount) !== String(credit.amount) ||
      debit.currency !== credit.currency
    ) {
      throw new Error("Ledger debit and credit mismatch");
    }

    // Verify original payment details
    if (
      debit.wallet_id !== sender_wallet_id ||
      credit.wallet_id !== receiver_wallet_id ||
      String(debit.amount) !== String(amount) ||
      String(credit.amount) !== String(amount) ||
      debit.currency !== currency ||
      credit.currency !== currency ||
      String(ledgerTransaction.amount) !== String(amount) ||
      ledgerTransaction.currency !== currency
    ) {
      throw new Error("Ledger transaction does not match payment");
    }
  }

  return {
    paymentId,
    walletOperations,
    ledgerTransaction,
    reserveOperation,
    creditOperation,
  };
};

// Determine next recovery step
export const determineRecoveryStep = (state) => {
  const {
    reserveOperation,
    creditOperation,
    ledgerTransaction,
  } = state;

  // No financial operation exists
  if (
    !reserveOperation &&
    !ledgerTransaction &&
    !creditOperation
  ) {
    return "RESERVING";
  }

  // Reservation exists, ledger not posted
  if (
    reserveOperation?.status === "reserved" &&
    !ledgerTransaction &&
    !creditOperation
  ) {
    return "LEDGER_POSTING";
  }

  // Ledger posted, reservation still reserved
  if (
    reserveOperation?.status === "reserved" &&
    ledgerTransaction &&
    !creditOperation
  ) {
    return "COMMITTING";
  }

  // Reservation committed, receiver not credited
  if (
    reserveOperation?.status === "committed" &&
    ledgerTransaction &&
    !creditOperation
  ) {
    return "CREDITING";
  }

  // All financial operations completed
  if (
    reserveOperation?.status === "committed" &&
    ledgerTransaction &&
    creditOperation?.status === "committed"
  ) {
    return "COMPLETED";
  }

  // Unexpected combinations must not resume automatically
  throw new Error(
    "Payment state requires manual investigation"
  );
};
