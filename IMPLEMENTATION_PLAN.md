# Money Manager implementation plan

## Chosen architecture

This repository uses a TypeScript application with a React/Vite client, an Express API, PostgreSQL, Prisma ORM, Zod validation, and a ledger-first domain service. The browser never calculates authoritative balances: financial balances and accounting reports come from posted journal lines.

Money is stored as PostgreSQL `Decimal(19,4)` values. JavaScript financial calculations use `decimal.js`; native floating point is not used for posting or balancing entries.

## Delivery sequence

1. Foundation: application shell, authentication, profile isolation, database schema, chart-of-accounts templates, migrations, and realistic seeds.
2. Core money flows: accounts, categories, Money In, Money Out, transfers, journal posting, reversals, and attachments.
3. Financial overview: ledger-derived dashboard, recent activity, planning warnings, and account summaries.
4. Planning and wealth: budgets, bills, expected income, goals, assets, debts, and net-worth calculations.
5. Reports and operations: cash flow, profit and loss, trial balance, balance sheet, exports, imports, and reconciliation.
6. Hardening: focused accounting tests, integration coverage, responsive/accessibility checks, security review, and production runbooks.

## Boundary rules

- Every user-owned query is scoped by both owner and profile.
- `All Profiles` is a query scope, never a record owner.
- A posted transaction and its journal are created atomically.
- Each journal has at least two lines and equal debit and credit totals.
- A stable transaction idempotency key prevents duplicate posting.
- Posted financial records are reversed, not silently deleted.
- Transfers move value between asset/liability ledger accounts and never touch income or expense.

## Initial release scope

The first working release includes authentication, profiles, accounts, categories, the three primary transaction flows, reversals, dashboard, assets, basic planning, and ledger reports. CSV importing, reconciliation, recurring job execution, and cloud object storage retain complete schema boundaries but are follow-on operational modules.

