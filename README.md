# Money Manager

A ledger-backed financial command centre for one owner managing personal finances and multiple businesses. The user interface stays in plain language—Money In, Money Out, Transfer—while every posted transaction creates a balanced general-ledger journal underneath.

## Stack

- React 19, Vite, TypeScript, React Router, Recharts, and Lucide
- Express 5 with server-side Zod validation
- PostgreSQL with Prisma ORM
- HTTP-only cookie authentication with JWT session tokens and bcrypt password hashes
- Decimal.js and PostgreSQL `Decimal(19,4)` for financial values
- Vitest for accounting-domain rules

## What works

- Owner sign-in and protected API routes
- Create, switch, and consolidate financial profiles
- Create cash, bank, mobile money, savings, credit, and other accounts
- Opening balances posted against opening-balance equity
- Post Money In, Money Out, and transfers with optional fees
- Balanced journals, stable idempotency keys, and atomic database writes
- Reverse posted transactions without deleting their audit history
- Upload validated receipts, images, PDFs, DOCX, and XLSX files
- Ledger-derived dashboard, account balances, net worth, trial balance, and profit summary
- Assets with valuations
- Editable and archivable budgets with live posted-spending movements, overlap protection, and threshold warnings
- Operational bills and expected income that post to the ledger when settled
- Savings goals with progress tracking and 7, 30, and 90-day cash forecasts
- Budget threshold warnings and upcoming attention items
- CSV report export, print-ready reports, mobile navigation, and responsive forms
- Seeded Personal, Island Farm, and Restaurant profiles with realistic UGX activity

## Local setup

Requirements: Node.js 20+, npm 10+, PostgreSQL 16+ or Docker Desktop.

1. Create the local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Start PostgreSQL. With Docker Desktop running:

   ```powershell
   docker compose up -d postgres
   ```

3. Install dependencies and generate the Prisma client:

   ```powershell
   npm install
   npm run db:generate
   ```

4. Apply the checked-in migration and seed realistic data:

   ```powershell
   npm run db:deploy
   npm run db:seed
   npm run db:verify
   ```

5. Start the React client and Express API:

   ```powershell
   npm run dev
   ```

Open `http://localhost:5173`.

Development login:

- Email: `owner@moneymanager.local`
- Password: `MoneyManager2026!`

These credentials are only created by the development seed. Replace the JWT secret and remove or change the seed account in any shared environment.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API and React client with file watching |
| `npm run build` | Compile the Express server and create the Vite production bundle |
| `npm start` | Run the compiled Express server |
| `npm run typecheck` | Strict-check client and server TypeScript |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm test` | Run financial-rule tests |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:deploy` | Apply checked-in migrations |
| `npm run db:seed` | Create the local owner and realistic financial data |
| `npm run db:verify` | Confirm every journal is balanced and profile-consistent |
| `npm run db:studio` | Inspect the local database using Prisma Studio |

## Production configuration

Set at least:

- `DATABASE_URL`: PostgreSQL connection URL with TLS settings appropriate to the provider
- `JWT_SECRET`: long, random secret kept outside source control
- `CLIENT_ORIGIN`: exact public client origin allowed by CORS
- `PORT`: Express port, default `4000`
- `VITE_API_URL`: public API base URL at client build time
- `UPLOAD_DIR`: persistent attachment location

Run `npm ci`, `npm run db:deploy`, `npm run build`, then `npm start`. The Express service serves the compiled React app from `dist/`. On the first visit to an empty database, create the owner account through the protected one-time setup screen; this creates only an empty Personal profile and its required accounting structure. Do not run `npm run db:seed` in production.

### Railway

The checked-in `railway.json` builds the application, applies Prisma migrations in Railway's pre-deploy phase, starts the single Express/React service, and checks `/api/health`. Add a PostgreSQL service and set `DATABASE_URL` to its Railway reference, plus a long random `JWT_SECRET` and `NODE_ENV=production`. The Railway deployment never invokes the development seed.

## Financial integrity

- Only posted transactions affect balances.
- Account balances come from journal lines, not editable cached balance fields.
- Transactions and journals are committed in one serializable PostgreSQL transaction.
- A journal contains at least two lines and total debits must equal total credits.
- Transfers only move value between accounts and never inflate income or spending.
- Transfer fees become a separate Bank Fees expense line.
- Posted transactions are corrected with reversing entries, never hard-deleted.
- Every user-owned query validates both owner and profile boundaries.

See [Architecture](docs/ARCHITECTURE.md) for the data model, services, API boundaries, and posting examples.

## File storage

Development uploads use the `uploads/` directory through a storage-key abstraction in the attachment record. The API validates type, size, ownership, and access before storing or serving a file. For production, replace disk storage with S3-compatible or another durable object store while preserving the attachment service contract.

## Known limitations and roadmap

This first release concentrates on the ledger foundation and daily money workflows. The schema already reserves boundaries for the following modules, but their complete operational interfaces remain future work:

- CSV statement mapping, duplicate review, and posting workflow
- Account reconciliation workflow
- Automatic recurring-rule execution
- Debt repayment schedules and principal/interest/fee posting UI
- Full foreign-currency revaluation
- Cloud object storage and OCR processing
- End-to-end browser tests and production password-reset/MFA flows

These are not represented as finished buttons. The implemented navigation and primary actions are connected to persisted data.
