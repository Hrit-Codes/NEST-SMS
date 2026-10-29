# Nest SMS — Mini SMS Gateway

A REST API that accepts SMS requests, charges credits from a per-user wallet, delivers messages through mock providers (routes), automatically **fails over** to the next provider when one fails, and **refunds** credits when a message cannot be delivered on any route.

Built as the take-home assignment for the **Backend Developer Intern** role at **Nest Nepal Business Solutions**.

> **Core guarantee:** a credit is never lost or double-spent. Parallel requests, a failing route, or a provider outage cannot leave a wallet with the wrong balance.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Requirement Coverage](#requirement-coverage)
3. [Getting Started](#getting-started)
4. [Environment Variables](#environment-variables)
5. [Project Structure](#project-structure)
6. [Data Model](#data-model)
7. [How Sending Works](#how-sending-works)
8. [Counting SMS and Validating Numbers](#counting-sms-and-validating-numbers)
9. [API Reference](#api-reference)
10. [Route Health Formula](#route-health-formula)
11. [Design Decisions](#design-decisions)
12. [Testing the Concurrency Guarantee](#testing-the-concurrency-guarantee)
13. [Known Limitations and What I Would Improve](#known-limitations-and-what-i-would-improve)
14. [Demo](#demo)
15. [Author](#author)

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript |
| Framework | NestJS |
| Database | PostgreSQL (supports transactions and row-level locking) |
| ORM | Prisma with the `pg` driver adapter |
| Authentication | JWT (`@nestjs/jwt`, `passport-jwt`), passwords hashed with `bcrypt` |
| Validation | `class-validator` / `class-transformer` through a global `ValidationPipe` |
| Rate limiting | `@nestjs/throttler` |

---

## Requirement Coverage

### Part A: Core requirements

| # | Requirement | Status | Where |
| --- | --- | --- | --- |
| 01 | Register and log in with JWT, one wallet per user | Done | `src/auth`, `src/wallet` |
| 02 | 2–3 mock providers with priority, balance and failure rate | Done (3 routes, seeded) | `prisma/seed.ts`, `src/providers` |
| 03 | `POST /sms/send`: validate and normalise numbers, calculate parts and cost, reject on insufficient credits, deduct in a DB transaction, send by priority with failover | Done | `src/sms/sms.service.ts` |
| 04 | `GET /sms/logs`: paginated, filter by status, date and number | Done | `src/sms/sms.service.ts` |
| 05 | `GET /routes/health`: balance, success rate, health % with a documented formula | Done, with the caveat that the success rate uses the last 100 attempts instead of a strict 24 h window (see [Route Health Formula](#route-health-formula)) | `src/providers`, `src/routes` |
| 06 | Refund credits for messages that fail on every route | Done (atomic and idempotent) | `SmsService.refund()` |

### Part B: Bonus

| # | Item | Status |
| --- | --- | --- |
| B1 | Queue (BullMQ / Redis) | Not implemented. Delivery runs synchronously inside the request. |
| B2 | Rate limiting (per user, 60 req/min) | Done |
| B3 | Delivery reports (webhook) | Not implemented |
| B4 | Unit tests | Not implemented. Only the default NestJS spec scaffolds exist. |
| B5 | Docker Compose | Not implemented |

I focused on getting Part A correct (transactions, failover and refunds) rather than spreading effort across every bonus item.

---

## Getting Started

### Prerequisites

- **Node.js 20.19+** (or 22+) and npm
- A **PostgreSQL** database that accepts SSL connections (for example Neon, Supabase or Render)

> `src/prisma/prisma.service.ts` connects with `ssl: { rejectUnauthorized: false }`. If you run a local PostgreSQL **without** SSL, remove that `ssl` option so the connection succeeds.

### 1. Clone and install

```bash
git clone <your-repository-url>
cd nest-sms
npm install
```

### 2. Configure environment

Create a `.env` file in the project root (see [Environment Variables](#environment-variables)):

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require"
JWT_SECRET="replace-with-a-long-random-string"
PORT=3000
```

### 3. Generate the client and create the schema

```bash
npx prisma generate
npx prisma migrate dev --name init
```

> If you use a pooled connection string (for example Neon's `-pooler` host), run migrations against the **direct** (non-pooled) connection string, or use `npx prisma db push` instead.

### 4. Seed the mock providers

```bash
npm run seed
```

The seed uses `upsert`, so it is safe to re-run. Re-running resets each provider to its initial balance and failure rate.

| Route | Priority | Balance | Max balance | Failure rate |
| --- | --- | --- | --- | --- |
| `ROUTE_A` | 1 (tried first) | 1000 | 1000 | 30% |
| `ROUTE_B` | 2 (fallback) | 500 | 500 | 10% |
| `ROUTE_C` | 3 (last resort) | 100 | 200 | 50% |

### 5. Run the server

```bash
# development (watch mode)
npm run start:dev

# production
npm run build
npm run start:prod
```

The API is served at **`http://localhost:3000/api/v1`**.

### Useful scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Start with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run seed` | Seed or reset the mock providers |
| `npm run lint` | Lint with oxlint |
| `npm run format` | Format with Prettier |
| `npm test` | Run Jest |

---

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes (strongly recommended) | Secret used to sign JWTs. If unset, the app falls back to an insecure development default, so always set it. |
| `PORT` | No | HTTP port (default `3000`) |

`.env` is git-ignored. Never commit real credentials.

---

## Project Structure

```text
nest-sms/
├── prisma/
│   ├── schema.prisma            # Data model (User, Wallet, Provider, Message, ProviderAttempt)
│   └── seed.ts                  # Seeds ROUTE_A / ROUTE_B / ROUTE_C
├── src/
│   ├── main.ts                  # Bootstrap, /api/v1 prefix, global ValidationPipe
│   ├── app.module.ts            # Root module, global throttler config
│   ├── auth/                    # Register, login, JWT strategy and guard, DTOs
│   ├── wallet/                  # Balance and top-up
│   ├── providers/               # Mock provider simulation and route health
│   ├── sms/                     # Send, failover, refund, logs, message lookup
│   ├── routes/                  # GET /routes/health
│   ├── prisma/                  # PrismaService (pg adapter)
│   └── common/
│       ├── helpers/
│       │   ├── phone.helper.ts        # Nepali number validation and normalisation
│       │   └── sms-counter.helper.ts  # GSM-7 / Unicode encoding and part counting
│       └── decorators/get-user.decorator.ts
└── test/                        # e2e scaffold
```

---

## Data Model

```text
User 1──1 Wallet
User 1──* Message *──1 Provider (nullable until delivered)
Message 1──* ProviderAttempt *──1 Provider
```

| Model | Purpose | Key fields |
| --- | --- | --- |
| `User` | Account | `email` (unique), `passwordHash` |
| `Wallet` | One credit balance per user | `userId` (unique), `balance` (integer) |
| `Provider` | A mock SMS route | `name` (unique), `priority`, `balance`, `maxBalance`, `failureRate`, `isActive` |
| `Message` | One row per recipient | `to`, `body`, `encoding` (`GSM7`/`UNICODE`), `parts`, `cost`, `status` (`PENDING`/`SENT`/`FAILED`), `refunded`, `providerId` |
| `ProviderAttempt` | Audit trail of every delivery attempt | `messageId`, `providerId`, `success`, `errorReason`, `createdAt` |

Credits are stored as **integers**, so there are no floating-point rounding errors on money-like values. **1 credit = 1 SMS part.**

Indexes support the common queries: `(userId, status, createdAt)` and `(userId, createdAt)` for logs, `to` for number search, and `(providerId, createdAt)` for route health.

---

## How Sending Works

```mermaid
flowchart TD
    A["POST /sms/send"] --> B["JWT guard, rate limit, DTO validation"]
    B --> C["Normalise every number"]
    C -->|any invalid| X["400 with the invalid numbers, nothing charged"]
    C --> D["Count parts, total cost = parts x recipients"]
    D --> E["DB transaction"]
    E -->|balance below cost| Y["400 Insufficient credits"]
    E --> F["Debit wallet and create PENDING messages"]
    F --> G["For each message, providers by priority"]
    G --> H["Reserve provider credits"]
    H --> I{"Provider send OK?"}
    I -->|yes| J["Log attempt, mark SENT"]
    I -->|no| K["Release provider credits, log failed attempt, try next"]
    K --> G
    G -->|all routes exhausted| L["Refund transaction: FAILED and wallet credited"]
```

### Step by step

1. **Validate.** `to` and `body` are checked. Every number is normalised. If any number is invalid, the whole request is rejected with `400` and the invalid numbers are listed. Nothing is charged.
2. **Price.** The encoding and part count are computed once for the message body. `totalCost = parts × number of recipients`.
3. **Charge atomically.** Inside a single DB transaction:
   - `UPDATE wallet SET balance = balance - cost WHERE userId = ? AND balance >= cost`
   - If zero rows are updated, the request is rejected with `Insufficient credits`.
   - Otherwise one `PENDING` message per recipient is created in the same transaction.
4. **Deliver with failover.** For each message, active providers with enough balance are tried in ascending `priority`. For each candidate:
   - Provider credits are reserved with a conditional update (`balance >= parts`).
   - The mock send runs (`Math.random() < failureRate` means failure).
   - On failure, the provider credits are released and a failed `ProviderAttempt` is stored, all in one transaction. The next provider is then tried.
   - On success, a successful `ProviderAttempt` is stored and the message becomes `SENT` with its `providerId`.
5. **Refund.** If every provider fails or has no balance, the message is marked `FAILED` and its credits go back to the wallet in one transaction.

### Why it is safe

| Risk | Protection |
| --- | --- |
| Two parallel requests overspend the wallet | The balance check and decrement are a single conditional `UPDATE`. PostgreSQL row-locks the wallet, so concurrent requests are serialised and the second re-checks the balance after the first commits. |
| Credits debited but no record of what they paid for | The debit and the `PENDING` message rows are created in the same transaction. |
| A refund runs twice | The refund only applies when `status = PENDING AND refunded = false`. A repeated attempt updates zero rows and credits nothing. |
| Provider balance drifts on failure | Provider credits are reserved before sending and released in the same transaction that logs the failed attempt. |
| Slow provider calls holding DB locks | Delivery happens **after** the debit transaction commits, so no lock is held during the network call. |

---

## Counting SMS and Validating Numbers

### Encoding and parts

| Encoding | When | Single SMS | Multi-part size |
| --- | --- | --- | --- |
| GSM-7 | Only characters in the standard GSM-7 set | 160 chars | 153 per part |
| Unicode | Any other character (Devanagari, emoji, etc.) | 70 chars | 67 per part |

- A message that fits in one SMS counts as 1 part. Longer messages are `ceil(length / 153)` (GSM-7) or `ceil(length / 67)` (Unicode).
- A single non-GSM character switches the **entire** message to Unicode.
- Examples: 200 English characters → **2 parts** (153 + 47). 100 Nepali characters → **2 parts** (67 + 33).
- Characters from the GSM-7 *extension* table (such as `[ ] { } ^ ~ | \ €`) are conservatively treated as Unicode.

### Phone numbers

A valid number is **10 digits starting with 97 or 98**, with an optional `+977` or `977` prefix that is normalised away.

| Input | Result | Reason |
| --- | --- | --- |
| `9841234567` | `9841234567` | Valid as it is |
| `+9779801122334` | `9801122334` | Prefix removed |
| `9779761234567` | `9761234567` | Prefix removed |
| `9612345678` | invalid | Does not start with 97 or 98 |
| `984123456` | invalid | Only 9 digits |

---

## API Reference

**Base URL:** `http://localhost:3000/api/v1`

Protected endpoints require the header `Authorization: Bearer <token>`.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | Create an account and wallet, returns a JWT |
| POST | `/auth/login` | No | Log in, returns a JWT |
| GET | `/wallet/balance` | Yes | Current credit balance |
| POST | `/wallet/topup` | Yes | Add credits (demo helper) |
| POST | `/sms/send` | Yes | Send SMS to one or more numbers |
| GET | `/sms/logs` | Yes | Paginated, filterable message history |
| GET | `/sms/messages/:id` | Yes | One message with its delivery attempts |
| GET | `/routes/health` | No | Health of every provider route |

### Auth

**`POST /auth/register`**

```json
{ "email": "hrit@example.com", "password": "Strong#123" }
```

Password rules: at least 6 characters, with one uppercase letter, one number and one special character. New accounts receive **50 starter credits**.

Response `201`:

```json
{
  "user": {
    "id": "uuid",
    "email": "hrit@example.com",
    "wallet": { "id": "uuid", "userId": "uuid", "balance": 50 }
  },
  "token": "<jwt>"
}
```

**`POST /auth/login`**: same body, returns the same shape with status `200`. Wrong credentials return `401 Invalid credentials`. A duplicate email on register returns `409`. Tokens expire after 1 day.

### Wallet

```bash
GET  /wallet/balance            ->  { "balance": 50 }
POST /wallet/topup {"amount": 100}  ->  { "balance": 150 }
```

`topup` is a convenience endpoint for testing. A real system would sit behind a payment flow.

### Send SMS

**`POST /sms/send`**

```json
{
  "to": ["9841234567", "+9779801122334"],
  "body": "Hello from Nest SMS!"
}
```

> The message text field is named **`body`** in this implementation.

Response `201`:

```json
{
  "totalCost": 2,
  "messages": [
    {
      "id": "uuid",
      "to": "9841234567",
      "body": "Hello from Nest SMS!",
      "encoding": "GSM7",
      "parts": 1,
      "cost": 1,
      "status": "SENT",
      "refunded": false,
      "providerId": "uuid"
    },
    {
      "id": "uuid",
      "to": "9801122334",
      "body": "Hello from Nest SMS!",
      "encoding": "GSM7",
      "parts": 1,
      "cost": 1,
      "status": "FAILED",
      "refunded": true,
      "providerId": null
    }
  ]
}
```

A message that failed on every route comes back as `FAILED` with `refunded: true`. Its credits are already back in the wallet.

| Status | Cause |
| --- | --- |
| `400` | Invalid number(s) (they are listed in the message), empty recipient list, missing body, or `Insufficient credits` |
| `401` | Missing or invalid token |
| `429` | Rate limit exceeded (60 requests per minute per user) |

### Message logs

**`GET /sms/logs`**

| Query param | Description |
| --- | --- |
| `status` | `pending`, `sent` or `failed` |
| `dateFrom` | ISO date or datetime, inclusive lower bound on `createdAt` |
| `dateTo` | ISO date or datetime, inclusive upper bound on `createdAt` |
| `number` | Recipient number (normalised before matching, so `+977…` works) |
| `page` | Page number, default `1` |
| `limit` | Page size, default `20`, max `100` |

```text
GET /sms/logs?status=failed&dateFrom=2026-01-01&number=9841234567&page=1&limit=10
```

Results are scoped to the authenticated user and sorted newest first. Each message includes its `attempts` (with the provider for each attempt), so you can see exactly which routes were tried.

```json
{
  "messages": [ { "id": "uuid", "status": "SENT", "attempts": [ { "success": false, "errorReason": "Provider ROUTE_A failed to send", "provider": { "name": "ROUTE_A" } }, { "success": true, "provider": { "name": "ROUTE_B" } } ] } ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
}
```

The example above shows a **failover**: `ROUTE_A` failed, then `ROUTE_B` delivered.

### Route health

**`GET /routes/health`**

```json
[
  {
    "provider": "ROUTE_A",
    "priority": 1,
    "balance": 1000,
    "maxBalance": 1000,
    "failureRate": 0.3,
    "recentSuccessRate": 0.71,
    "healthScore": 70
  }
]
```

---

## Route Health Formula

```text
healthScore = (balance / maxBalance) × 100 × (1 − failureRate)
```

| Component | Meaning |
| --- | --- |
| `balance / maxBalance` | How much sendable capacity the route has left. A nearly empty route cannot carry traffic. |
| `1 − failureRate` | The route's configured reliability. |
| Result | A score from 0 to 100, rounded to 2 decimals. |

**Examples with the seed data (full balances):**

| Route | Calculation | Score |
| --- | --- | --- |
| `ROUTE_A` | 1000/1000 × 100 × 0.70 | **70** |
| `ROUTE_B` | 500/500 × 100 × 0.90 | **90** |
| `ROUTE_C` | 100/200 × 100 × 0.50 | **25** |

**`recentSuccessRate`** is `successful attempts / total attempts` over the route's **most recent 100 delivery attempts** (returns `1` when a route has no attempts yet). It is reported next to the score so the configured reliability can be compared with observed behaviour.

**Why this formula:** a route is only useful if it has both capacity and reliability, so the two are multiplied. A route with no balance scores 0 regardless of how reliable it is, and a high-balance route that fails half the time is penalised.

**Known gap:** the brief asks for the success rate over the last 24 hours. This implementation uses the last 100 attempts. Switching to a strict window is a small change, since `ProviderAttempt` already stores `createdAt` and is indexed on `(providerId, createdAt)`. See [improvements](#known-limitations-and-what-i-would-improve).

---

## Design Decisions

- **PostgreSQL + Prisma.** Real transactions and row-level locking are required for the "never double-spend" guarantee.
- **Conditional atomic update instead of read-then-write.** `UPDATE … WHERE balance >= cost` is race-free, needs no explicit locking code, and is simple to reason about.
- **One message row per recipient.** Each recipient has its own status, cost, provider and attempts, so partial success is representable and refunds are exact per message.
- **Audit trail through `ProviderAttempt`.** Every attempt (success or failure) is stored, which powers failover visibility in the logs and the health endpoint.
- **Idempotent refunds.** The `refunded` flag plus the `status = PENDING` guard make a double refund impossible.
- **Provider credits are reserved before sending.** This keeps provider balances accurate when concurrent sends hit the same route.
- **Debit commits before delivery.** Provider calls never run inside a DB transaction.
- **Strict input validation.** The global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, so unknown fields are rejected.
- **Per-user rate limiting.** Throttling is keyed by user id (falling back to IP) at 60 requests per minute on wallet and SMS routes.
- **Logs are scoped to the caller.** Users can only read their own messages.

---

## Testing the Concurrency Guarantee

The brief's scenario: *20 parallel send requests against a wallet that can only afford 10 should result in exactly 10 successes.*

A new account starts with 50 credits. Each request below sends to 5 recipients at 1 part each, which costs 5 credits, so exactly **10 of 20** requests can be afforded.

```bash
BASE=http://localhost:3000/api/v1

# 1. Register and capture the token
TOKEN=$(curl -s -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"race@example.com","password":"Strong#123"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).token")

# 2. Fire 20 parallel requests (5 recipients x 1 part = 5 credits each)
seq 1 20 | xargs -P 20 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST $BASE/sms/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":["9841234567","9841234568","9841234569","9841234570","9841234571"],"body":"race test"}' \
  | sort | uniq -c

# 3. Check the final balance
curl -s $BASE/wallet/balance -H "Authorization: Bearer $TOKEN"
```

**Expected:** 10 responses with `201` and 10 with `400 Insufficient credits`. The balance never goes negative.

> Because refunds are real, a message that fails on every route returns its credits. In rare runs that can legitimately free enough credit for one extra request to be accepted. The wallet is never overspent either way.

### Manual checks for the other scenarios

| Scenario | How to see it |
| --- | --- |
| Number normalisation | Send to `+9779801122334` and check `to` in the response (`9801122334`) |
| Invalid number | Send to `9612345678` and expect a `400` listing it |
| Unicode costing | Send a 100-character Nepali message and expect `encoding: UNICODE`, `parts: 2` |
| Failover | Send several messages, then open `/sms/logs` and look for messages whose `attempts` show a failed `ROUTE_A` followed by a successful `ROUTE_B` |
| Refund | Set all `failureRate` values to `1.0` in the `Provider` table (or lower provider balances to 0), send an SMS, and observe `FAILED` + `refunded: true` and an unchanged wallet balance |
| Rate limit | Send more than 60 requests in a minute and expect `429` |

---

## Known Limitations and What I Would Improve

Being explicit about the gaps and the next steps:

1. **24-hour success rate.** Health currently uses the last 100 attempts per route. I would filter `ProviderAttempt` by `createdAt >= now() - 24h` and blend the *observed* success rate into the score instead of relying only on the configured `failureRate`.
2. **Background queue (B1).** Delivery is synchronous, so a large recipient list makes the request slow. A BullMQ/Redis worker would let the API return immediately with `PENDING` messages and deliver in the background, with retries and backoff.
3. **Crash recovery.** If the process dies after the debit but before delivery finishes, messages stay `PENDING`. A reconciliation job should pick up stale `PENDING` messages and either retry or refund them.
4. **Unit tests (B4).** Only the default NestJS scaffolds exist. The highest-value tests would cover the part counter, number normalisation, failover order and refund idempotency, plus a concurrency integration test.
5. **Delivery webhooks (B3).** Add a signed webhook endpoint that updates message status from provider delivery reports.
6. **Docker Compose (B5).** One command to start the API, PostgreSQL and Redis.
7. **`977` normalisation edge case.** A genuine 10-digit number that begins with `977` would have its prefix stripped. The prefix should only be removed when the total length is 13 digits (or 12 with `+`).
8. **Provider abstraction.** Each route exposes its balance through the database, not through a dedicated `getBalance()` method. A `Provider` interface with `send()` and `getBalance()` would make real gateways pluggable.
9. **Wallet ledger.** Add an append-only `WalletTransaction` table (debit, refund, top-up) so every balance change is traceable.
10. **Top-up endpoint.** `POST /wallet/topup` is a demo helper and should be admin-only or payment-backed.
11. **Hardening.** Remove the `JWT_SECRET` fallback and fail fast if it is missing, add refresh tokens, deduplicate recipients, cap recipients per request, and add structured logging and health probes.

---

## Demo

A 3–5 minute walkthrough covering **a send, a failover, a refund and the logs**: `<add your recording or deployed link here>`

---

## Author

**Hrit** — Backend Developer Intern candidate, Nest Nepal Business Solutions