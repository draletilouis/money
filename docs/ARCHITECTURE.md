# Architecture

## System shape

The React client is a presentation and workflow layer. It calls the Express API using cookie-authenticated requests and never calculates an authoritative financial balance. Express owns validation, authorization, domain orchestration, and audit creation. Prisma is the only database access layer, and PostgreSQL is the durable source of truth.

```text
React / Vite
  -> shared Zod-compatible request contracts
  -> Express routes and authentication
  -> profile/account/transaction/report services
  -> ledger posting engine
  -> Prisma transactions
  -> PostgreSQL
```

Important locations:

- `src/`: React application, screens, shell, forms, and API client
- `shared/contracts.ts`: request validation and shared input types
- `server/src/app.ts`: HTTP routes, middleware, uploads, and response boundaries
- `server/src/services/`: profile, posting, balance, and reporting services
- `server/src/domain/ledger.ts`: pure journal construction and balancing rules
- `prisma/schema.prisma`: relational model and constraints
- `prisma/migrations/`: deployable PostgreSQL migrations
- `prisma/seed.ts`: realistic, balanced development data
- `scripts/verify-ledger.ts`: database-level ledger integrity check

## Ownership and profile isolation

Every financial record belongs to a `Profile`, and every profile belongs to a `User`. A profile ID received from the browser is never trusted on its own: the API resolves it together with the authenticated user ID. Account and category inputs are independently checked against that same profile before a financial write begins.

`All Profiles` is represented as query scope in the browser preference. It is not stored as a profile and cannot own an account or transaction.

## Money representation

PostgreSQL stores money as `Decimal(19,4)`. Exchange rates use `Decimal(19,8)`. JavaScript posting calculations use Decimal.js and convert to fixed decimal strings before writing through Prisma. Native floating-point arithmetic is not used to construct, balance, or reverse journal entries.

The initial interface displays UGX without fractional digits, but currency codes are stored on profiles, accounts, transactions, and journal lines. Transaction exchange-rate and base-amount fields preserve the path to fuller multi-currency accounting.

## Posting lifecycle

1. Express validates the request using Zod.
2. The service verifies owner, profile, active accounts, and compatible category.
3. The pure ledger engine creates debit and credit lines.
4. The engine rejects fewer than two lines or unequal totals.
5. Prisma creates the user transaction, journal entry, lines, and audit event inside one serializable database transaction.
6. A profile-scoped idempotency key prevents duplicate posting.
7. The API returns only after the complete financial write commits.

If any step fails, PostgreSQL rolls back the entire write; a transaction cannot remain Posted without its journal.

## Posting rules

| User action | Debit | Credit |
| --- | --- | --- |
| Money In | Receiving financial account | Income category account |
| Money Out | Expense category account | Payment financial account |
| Transfer | Destination financial account | Source financial account |
| Transfer fee | Bank Fees expense | Included in source-account credit |
| Opening balance for asset account | Financial account | Opening Balance Equity |
| Owner contribution | Business cash/bank | Owner Contributions equity |
| Owner withdrawal | Owner Withdrawals equity | Business cash/bank |
| Loan received | Cash/bank | Loan liability |
| Loan principal repayment | Loan liability | Cash/bank |
| Asset purchase | Fixed asset | Cash/bank or liability |

The pure domain engine already supports the extended posting types even where the simplified transaction dialog exposes only the three everyday flows.

## Reversals

A posted transaction is immutable. Reversal creates a new adjustment transaction and journal whose lines swap every original debit and credit. The new journal references the original; the original record is marked Reversed and points to its reversal. Reports include the complete history so the two entries net to zero.

## Balance and report queries

Asset and expense accounts use debit-normal balance logic. Liability, equity, and income accounts use credit-normal logic. Account cards, available cash, net worth, profit summary, and trial balance all aggregate journal lines with those normal-balance rules. Budgets aggregate Posted Money Out transactions within the category and date boundary, excluding reversed originals.

## Attachments

Multer currently implements the development disk adapter. It accepts JPEG, PNG, WebP, PDF, DOCX, and XLSX, limits each request to five files and each file to 10 MB, assigns a random stored name, and records ownership metadata in PostgreSQL. Download access rechecks the authenticated owner through the attachment profile.

The attachment model includes OCR state, extracted merchant/date/total, and confidence fields so a future OCR worker does not require a schema redesign.

## Security controls

- bcrypt password hashing
- signed, HTTP-only, same-site session cookie
- rate-limited sign-in endpoint
- Helmet response headers
- explicit credentialed CORS origin
- server-side Zod validation
- owner/profile checks on protected records
- randomized attachment storage names and allowlisted MIME types
- no financial values or secrets logged by the client
- audit events for profile/account creation, posting, and reversal

Production work should add password reset, MFA, CSRF tokens if deployment topology requires them, malware scanning for uploads, managed-secret rotation, and an external rate-limit store.

## Verification

`npm run db:verify` loads every journal with its lines and rejects any entry that:

- contains fewer than two lines;
- has unequal debit and credit totals; or
- references a transaction from another profile.

Unit tests separately cover Money In, Money Out, transfers with fees, same-account rejection, reversals, and normal account-balance signs.

