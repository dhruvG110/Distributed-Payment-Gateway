# Notification Service

The Notification Service stores in-app notifications in its own PostgreSQL database. It does not read other services' databases and does not send email, SMS, or push notifications.

## Configuration

Set these variables in this service's environment:

- `DATABASE_URL` — PostgreSQL URL dedicated to the Notification Service.
- `JWT_SECRET` — the same signing secret used by Auth Service.
- `INTERNAL_API_SECRET` — shared secret for trusted service-to-service event creation.
- `PORT` — optional; defaults to `4004`.

## Run

```powershell
npm install
npx prisma migrate dev --name init_notification_service
npm run prisma:generate
npm start
```

## API

User routes authenticate with the Auth Service's `access_token` cookie. Every query is restricted to that JWT subject:

- `GET /api/notifications?limit=20&cursor=<uuid>&unread=true|false`
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`
- `DELETE /api/notifications/:id`

Trusted services create idempotent events with `POST /api/notifications/internal/events` and the `x-internal-secret` header. Required JSON fields are `event_id`, `payment_id`, `recipient_user_id`, `type`, `amount`, and `currency`; `payment_failed` also requires `failure_reason`. The supported `type` values are `payment_success`, `payment_failed`, and `money_received`. Event IDs are deduplicated per recipient and type.

Amounts are integer minor units, as used by the payment flow. INR messages format those values as rupees and paise; other currencies are labeled as minor units.

Payment and Wallet producer integration is not included here. In particular, the current Wallet Service has no internal wallet-owner lookup route, so the trusted producer must supply `recipient_user_id` for a `money_received` event. A separate owner lookup API and producer wiring are needed before these notifications are generated automatically.
