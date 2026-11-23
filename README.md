# PayMesh --- Distributed Payment Gateway

PayMesh is a distributed payment gateway MVP built with six Node.js
microservices. It separates authentication, wallet management, payment
orchestration, ledger posting, notifications, and reconciliation into
independently deployable services.

> **Status:** MVP / demonstration project. It is not production-ready
> and must not be used to process real customer funds.

## Architecture

``` mermaid
flowchart TB
    Client[Web Client / Next.js Frontend]
    Proxy[Next.js API Proxy / Rewrites]
    Auth[Auth Service :4000]
    Wallet[Wallet Service :4001]
    Payment[Payment Service :4002]
    Ledger[Ledger Service :4003]
    Notify[Notification Service :4004]
    Recon[Reconciliation Service :4005]

    AuthDB[(Auth PostgreSQL)]
    WalletDB[(Wallet PostgreSQL)]
    PaymentDB[(Payment PostgreSQL)]
    LedgerDB[(Ledger PostgreSQL)]
    NotifyDB[(Notification PostgreSQL)]
    ReconDB[(Reconciliation PostgreSQL)]

    Client --> Proxy
    Proxy --> Auth
    Proxy --> Wallet
    Proxy --> Payment
    Proxy --> Notify

    Payment -->|Reserve / Commit / Credit| Wallet
    Payment -->|Post ledger entry| Ledger
    Ledger -->|Verify payment| Payment
    Recon --> Payment
    Recon --> Wallet
    Recon --> Ledger

    Auth --> AuthDB
    Wallet --> WalletDB
    Payment --> PaymentDB
    Ledger --> LedgerDB
    Notify --> NotifyDB
    Recon --> ReconDB
```

## Services

  ------------------------------------------------------------------------
  Service                                       Port Responsibility
  --------------------- ---------------------------- ---------------------
  Auth                                          4000 Registration,
                                                     sign-in, JWT access
                                                     token, HTTP-only
                                                     cookie

  Wallet                                        4001 Wallet creation,
                                                     balances,
                                                     freeze/unfreeze,
                                                     reserve, release,
                                                     commit, credit

  Payment                                       4002 Payment API,
                                                     idempotency,
                                                     orchestration,
                                                     processing state,
                                                     locks and retries

  Ledger                                        4003 Double-entry ledger
                                                     posting and internal
                                                     payment verification

  Notification                                  4004 Notification storage
                                                     and notification APIs

  Reconciliation                                4005 Reconciliation runs
                                                     and mismatch
                                                     reporting
  ------------------------------------------------------------------------

Each service owns its database. Services must access another service's
data through its API, not by querying another service's database
directly.

## Technology stack

-   Node.js (ES modules), Express.js
-   PostgreSQL / Neon
-   Prisma 7
-   Zod and Axios
-   JWT and HTTP-only cookies
-   Docker and Docker Compose
-   Next.js frontend
-   Render hosting for the demo deployment

## Payment workflow

``` mermaid
sequenceDiagram
    participant User
    participant Payment
    participant Wallet
    participant Ledger

    User->>Payment: POST /api/payments + Idempotency-Key
    Payment->>Payment: Validate and create payment
    Payment->>Wallet: Reserve sender funds
    Wallet-->>Payment: Reservation result
    Payment->>Ledger: POST /api/ledger/post
    Ledger->>Payment: GET /api/payments/internal/:id
    Payment-->>Ledger: Payment details and state
    Ledger->>Ledger: Write balanced debit/credit entries
    Ledger-->>Payment: Ledger posted
    Payment->>Wallet: Commit sender reservation
    Wallet-->>Payment: Commit result
    Payment->>Wallet: Credit receiver wallet
    Wallet-->>Payment: Credit result
    Payment->>Payment: Mark payment succeeded
    Payment-->>User: Payment result
```

The Payment Service persists processing progress and has retry/recovery
behavior. Wallet operations are payment-scoped and designed to be
idempotent. A sender commit does **not** guarantee receiver credit
succeeded. Investigate the payment, wallet operations, and ledger
entries before any manual recovery. Never blindly retry a payment or
edit balances directly.

## Data and consistency

-   Amounts use integer minor units (INR paise) and are serialized as
    strings in JSON.
-   Ledger transactions use debit and credit entries; a balanced posting
    has equal total debit and credit.
-   Payment requests require an `Idempotency-Key`. Reusing a key with
    different request data should be rejected.
-   Wallet reserve/commit/credit operations are associated with a
    payment ID.
-   This workflow spans multiple databases; it is not one ACID
    transaction. Recovery and reconciliation are essential.

## API overview

### Auth Service

  Method   Route                  Purpose
  -------- ---------------------- ----------------------------
  POST     `/api/auth/register`   Register user
  POST     `/api/auth/signin`     Sign in and set cookie
  POST     `/api/auth/logout`     Log out
  GET      `/api/auth/me`         Current authenticated user

### Wallet Service

  --------------------------------------------------------------------------------------------------
  Method                  Route                                              Purpose
  ----------------------- -------------------------------------------------- -----------------------
  POST                    `/api/wallet/create`                               Create current user's
                                                                             wallet

  GET                     `/api/wallet/me`                                   Get current user's
                                                                             wallet

  GET                     `/api/wallet/transactions`                         Wallet event history

  GET                     `/api/wallet/:id`                                  Get an owned wallet

  PATCH                   `/api/wallet/freeze`                               Freeze current user's
                                                                             wallet

  PATCH                   `/api/wallet/unfreeze`                             Unfreeze current user's
                                                                             wallet

  POST                    `/api/wallet/internal/reserve`                     Reserve sender funds

  POST                    `/api/wallet/internal/release`                     Release reservation

  POST                    `/api/wallet/internal/commit`                      Commit reservation

  POST                    `/api/wallet/internal/credit`                      Credit receiver wallet

  GET                     `/api/wallet/internal/operations/?paymentId=...`   Payment-scoped wallet
                                                                             operation lookup
  --------------------------------------------------------------------------------------------------

### Payment Service

  ------------------------------------------------------------------------------
  Method                  Route                          Purpose
  ----------------------- ------------------------------ -----------------------
  POST                    `/api/payments/`               Initiate payment;
                                                         requires
                                                         `Idempotency-Key`

  GET                     `/api/payments/`               List current user's
                                                         payments

  GET                     `/api/payments/:id`            Payment details

  POST                    `/api/payments/:id/cancel`     Cancellation subject to
                                                         state/safety checks

  GET                     `/api/payments/internal/:id`   Internal payment lookup
  ------------------------------------------------------------------------------

Example request:

``` http
POST /api/payments/
Idempotency-Key: demo-payment-0001
Content-Type: application/json
```

``` json
{
  "sender_wallet_id": "SENDER_WALLET_UUID",
  "receiver_wallet_id": "RECEIVER_WALLET_UUID",
  "amount": "2500",
  "currency": "INR"
}
```

**Important:** `sender_wallet_id` and `receiver_wallet_id` must be
wallet IDs, not user IDs. Get a user's wallet ID from
`GET /api/wallet/me`.

### Ledger Service

  Method   Route                                   Purpose
  -------- --------------------------------------- -------------------------
  POST     `/api/ledger/post`                      Internal ledger posting
  GET      `/api/ledger/internal/?paymentId=...`   Internal ledger lookup

Notification and Reconciliation services also expose their own APIs.
Check their route files for exact request schemas and the complete route
list before integrating them.

## Environment configuration

Create service-specific environment files locally. Never commit `.env`
files or expose secret values in logs, screenshots, issues, or chat.

  -----------------------------------------------------------------------
  Variable                            Purpose
  ----------------------------------- -----------------------------------
  `PORT`                              Service listen port; hosting
                                      platforms may set it

  `DATABASE_URL`                      That service's own PostgreSQL
                                      connection

  `DB_URL`                            Auth database connection used by
                                      the current Auth configuration

  `JWT_SECRET`                        JWT signing/verification secret;
                                      configure consistently where
                                      required

  `INTERNAL_API_SECRET`               Shared secret for protected
                                      internal service calls

  `WALLET_SERVICE_URL`                Wallet Service base URL used by
                                      Payment

  `LEDGER_SERVICE_URL`                Ledger Service base URL used by
                                      Payment

  `PAYMENT_SERVICE_URL`               Payment Service base URL used by
                                      Ledger

  `FRONTEND_URL`                      Exact frontend origin for
                                      credentialed CORS

  `NODE_ENV`                          Set to `production` in hosted
                                      production-like environments
  -----------------------------------------------------------------------

Use the exact variable names referenced in each service. Base URLs
should not end in `/` when code appends `/api/...`. Each service must
use its own database URL. Do not share database URLs across services.

## Run locally

### Prerequisites

-   Node.js and npm
-   Docker Desktop with Docker Compose
-   PostgreSQL databases or service-specific database URLs
-   Environment variables configured for each service

### Docker Compose

``` bash
git clone https://github.com/dhruvG110/Distributed-Payment-Gateway.git
cd Distributed-Payment-Gateway
```

Create the required service environment files, then run:

``` bash
docker compose up --build
```

View logs:

``` bash
docker compose logs -f
```

Stop containers:

``` bash
docker compose down
```

Apply Prisma migrations using each service's own Prisma configuration
and scripts. Verify the current package scripts before running
migrations; do not assume every service uses the same command.

## Deployment notes

-   Deploy each backend service independently.
-   Configure a separate database for each service.
-   Use private service-to-service URLs where the hosting platform
    supports them; do not use `localhost` between separately deployed
    services.
-   Configure frontend proxy/rewrite destinations to the deployed
    service URLs.
-   Credentialed CORS must use the exact frontend origin, not `*`.
-   Use HTTPS and secure HTTP-only cookies in hosted environments.
-   Free hosting plans can sleep and have resource/database limits; they
    are suitable for demos, not reliable payment production workloads.

## Known limitations and production work

Before production use, address at least:

-   Complete and test payment cancellation and compensation logic for
    every processing step.
-   Test recovery after sender commit but before receiver credit.
-   Add integration tests for duplicate requests, concurrency,
    insufficient balance, frozen/missing wallets, and service outages.
-   Add reconciliation procedures and operator tooling for
    stuck/mismatched payments.
-   Add structured logs, correlation IDs, metrics, tracing, alerting,
    and secret rotation.
-   Review authentication, authorization, rate limiting,
    internal-service security, and session lifecycle.
-   Add database backups, migration controls, connection pooling, and
    disaster recovery.
-   Obtain appropriate security, legal, regulatory, and payment-industry
    reviews before handling real funds.

## License

No license has been specified. Add a `LICENSE` file before permitting
reuse or redistribution.
