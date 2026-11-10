# PayMesh Reconciliation Service

Read-only service for comparing Payment, Wallet, and Ledger records. It writes reconciliation runs and records only to its own PostgreSQL database. It never mutates payment, wallet, reservation, or ledger state.

## Configuration

Copy `.env.example` to `.env` and set a dedicated `DATABASE_URL`, the shared `INTERNAL_API_SECRET`, and the three service base URLs. The service uses port `3006` by default.

The inspected APIs are:

- Payment: `GET /api/payments/internal/:id` with `x-internal-secret`. This route uses a path ID, not a query parameter.
- Wallet: `GET /api/wallet/internal/operations/?paymentId=<uuid>` with `x-internal-secret`.
- Ledger: `GET /api/ledger/internal/?paymentId=<uuid>` with `x-internal-secret`.

All service calls use five-second timeouts and retry temporary network, timeout, 408, 429, and 5xx failures up to three total attempts. Invalid response bodies and permanent 4xx responses are not retried.

## Reconciliation API

All routes below require `x-internal-secret`.

- `POST /api/reconciliation/run` with `{ "payment_ids": ["uuid"] }`
- `GET /api/reconciliation?limit=20&cursor=<record-uuid>&status=matched`
- `GET /api/reconciliation/mismatches?limit=20&cursor=<record-uuid>`
- `GET /api/reconciliation/:id`
- `GET /api/reconciliation/runs?limit=20&cursor=<run-uuid>&status=completed`
- `GET /api/reconciliation/runs/:id`
- `GET /health`

Batch requests accept 1 to 100 payment IDs, deduplicate IDs in the batch, and process each independently. A process-local guard rejects overlapping runs.

Successful payments require matching committed wallet reserve and credit operations and one balanced Ledger debit/credit pair. Processing payments are incomplete, not successful. Failed, cancelled, and reversed payments require an explicit released reserve; a missing reserve is flagged for review rather than assumed refunded. Contradictory terminal states are flagged for review.

## Scheduled runs

No scheduled worker is enabled. Payment Service currently has no internal list API for eligible payment IDs, and this service must not query its database. Manual batches are supported until a suitable Payment API is approved and implemented.

## Database and startup

Use the dedicated Reconciliation Service database:

```powershell
npm install
npx prisma migrate dev --name init_reconciliation_service
npm run prisma:generate
npm start
```

Development mode: `npm run dev`. Tests: `npm test`.

## Limitations

The service records observations, not repairs. It cannot prove a wallet's current balance from operation history alone, and no cross-service snapshot transaction exists; records may change while APIs are queried. Run state can also be interrupted by process/database failure. Unit tests use mocked API/database dependencies and do not replace isolated database or end-to-end testing.
