import type { AccountType, Prisma, ProfileType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/db.js';

const ledgerTemplate = [
  ['1000', 'Assets', 'ASSET', 'ASSETS'],
  ['2000', 'Liabilities', 'LIABILITY', 'LIABILITIES'],
  ['3000', 'Equity', 'EQUITY', 'EQUITY'],
  ['3100', 'Opening Balance Equity', 'EQUITY', 'OPENING_BALANCE_EQUITY'],
  ['3200', 'Owner Contributions', 'EQUITY', 'OWNER_CONTRIBUTIONS'],
  ['3300', 'Owner Withdrawals', 'EQUITY', 'OWNER_WITHDRAWALS'],
  ['4000', 'Income', 'INCOME', 'INCOME'],
  ['4100', 'Salary Income', 'INCOME', 'SALARY_INCOME'],
  ['4200', 'Sales Income', 'INCOME', 'SALES_INCOME'],
  ['4300', 'Rental Income', 'INCOME', 'RENTAL_INCOME'],
  ['4900', 'Other Income', 'INCOME', 'OTHER_INCOME'],
  ['5000', 'Expenses', 'EXPENSE', 'EXPENSES'],
  ['5100', 'Food', 'EXPENSE', 'FOOD_EXPENSE'],
  ['5200', 'Transport', 'EXPENSE', 'TRANSPORT_EXPENSE'],
  ['5210', 'Fuel', 'EXPENSE', 'FUEL_EXPENSE'],
  ['5300', 'Utilities', 'EXPENSE', 'UTILITIES_EXPENSE'],
  ['5400', 'Marketing', 'EXPENSE', 'MARKETING_EXPENSE'],
  ['5500', 'Repairs', 'EXPENSE', 'REPAIRS_EXPENSE'],
  ['5800', 'Bank Fees', 'EXPENSE', 'BANK_FEES'],
  ['5900', 'Other Expenses', 'EXPENSE', 'OTHER_EXPENSE'],
  ['1200', 'Accounts Receivable', 'ASSET', 'ACCOUNTS_RECEIVABLE'],
  ['1500', 'Fixed Assets', 'ASSET', 'FIXED_ASSETS'],
  ['2100', 'Accounts Payable', 'LIABILITY', 'ACCOUNTS_PAYABLE'],
  ['2200', 'Loans Payable', 'LIABILITY', 'LOANS_PAYABLE'],
] as const;

const categories = [
  ['Salary', 'INCOME', 'SALARY_INCOME'],
  ['Sales', 'INCOME', 'SALES_INCOME'],
  ['Rental income', 'INCOME', 'RENTAL_INCOME'],
  ['Other income', 'INCOME', 'OTHER_INCOME'],
  ['Food', 'EXPENSE', 'FOOD_EXPENSE'],
  ['Transport', 'EXPENSE', 'TRANSPORT_EXPENSE'],
  ['Fuel', 'EXPENSE', 'FUEL_EXPENSE'],
  ['Utilities', 'EXPENSE', 'UTILITIES_EXPENSE'],
  ['Marketing', 'EXPENSE', 'MARKETING_EXPENSE'],
  ['Repairs', 'EXPENSE', 'REPAIRS_EXPENSE'],
  ['Bank fees', 'EXPENSE', 'BANK_FEES'],
  ['Other expense', 'EXPENSE', 'OTHER_EXPENSE'],
] as const;

type ProfileInput = { name: string; type: ProfileType; description?: string; baseCurrencyCode: string; financialYearStart: number };

async function createProfileInDatabase(database: Prisma.TransactionClient, ownerId: string, input: ProfileInput) {
    const profile = await database.profile.create({ data: { ownerId, ...input } });
    for (const [code, name, accountClass, systemKey] of ledgerTemplate) {
      await database.ledgerAccount.create({ data: { profileId: profile.id, code, name, accountClass, systemKey } });
    }
    const accounts = await database.ledgerAccount.findMany({ where: { profileId: profile.id, systemKey: { not: null } } });
    const byKey = new Map(accounts.map((account) => [account.systemKey, account.id]));
    await database.category.createMany({ data: categories.map(([name, type, key]) => ({ profileId: profile.id, name, type, ledgerAccountId: byKey.get(key)! })) });
    await database.profilePreference.upsert({ where: { userId: ownerId }, create: { userId: ownerId, selectedProfileId: profile.id }, update: { selectedProfileId: profile.id, allProfiles: false } });
    await database.auditEvent.create({ data: { userId: ownerId, profileId: profile.id, action: 'CREATED', recordType: 'PROFILE', recordId: profile.id, newValues: { name: profile.name, type: profile.type } } });
    return profile;
}

export async function createProfile(ownerId: string, input: ProfileInput) {
  return prisma.$transaction((database) => createProfileInDatabase(database, ownerId, input));
}

export async function initializeOwner(input: { name: string; email: string; passwordHash: string }) {
  return prisma.$transaction(async (database) => {
    await database.$executeRaw`SELECT pg_advisory_xact_lock(7212026)`;
    if (await database.user.count()) return null;

    await database.currency.upsert({ where: { code: 'UGX' }, create: { code: 'UGX', name: 'Ugandan Shilling', symbol: 'UGX', decimalPlaces: 0 }, update: {} });
    await database.currency.upsert({ where: { code: 'USD' }, create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 }, update: {} });
    const user = await database.user.create({ data: { name: input.name, email: input.email.toLowerCase(), passwordHash: input.passwordHash } });
    await createProfileInDatabase(database, user.id, { name: 'Personal', type: 'PERSONAL', description: 'Personal finances', baseCurrencyCode: 'UGX', financialYearStart: 1 });
    return user;
  });
}

const accountClassFor = (type: AccountType) => type === 'CREDIT_CARD' || type === 'LOAN' ? 'LIABILITY' as const : 'ASSET' as const;

export async function createFinancialAccount(ownerId: string, profileId: string, input: {
  name: string; type: AccountType; institution?: string; currencyCode: string; openingBalance: number;
  openingBalanceDate?: Date; includeInAvailableCash: boolean; includeInNetWorth: boolean; notes?: string;
}) {
  return prisma.$transaction(async (database) => {
    const profile = await database.profile.findFirstOrThrow({ where: { id: profileId, ownerId, status: 'ACTIVE' } });
    const count = await database.financialAccount.count({ where: { profileId } });
    const ledger = await database.ledgerAccount.create({ data: {
      profileId, code: `${accountClassFor(input.type) === 'ASSET' ? '11' : '21'}${String(count + 1).padStart(2, '0')}`,
      name: input.name, accountClass: accountClassFor(input.type), systemKey: `FINANCIAL_ACCOUNT_${count + 1}`,
    } });
    const account = await database.financialAccount.create({ data: { ...input, profileId, ledgerAccountId: ledger.id } });
    const opening = new Decimal(input.openingBalance);
    if (opening.isPositive()) {
      const equity = await database.ledgerAccount.findFirstOrThrow({ where: { profileId, systemKey: 'OPENING_BALANCE_EQUITY' } });
      const transaction = await database.transaction.create({ data: {
        profileId, type: 'OPENING_BALANCE', status: 'POSTED', amount: opening.toFixed(4), baseAmount: opening.toFixed(4),
        currencyCode: input.currencyCode, transactionDate: input.openingBalanceDate ?? new Date(), toAccountId: account.id,
        description: `Opening balance for ${account.name}`, idempotencyKey: `opening-${account.id}`,
      } });
      const asset = ledger.accountClass === 'ASSET';
      await database.journalEntry.create({ data: {
        profileId, transactionId: transaction.id, entryDate: transaction.transactionDate, postingDate: new Date(),
        description: transaction.description!, sourceType: 'TRANSACTION', sourceId: transaction.id,
        lines: { create: [
          { ledgerAccountId: ledger.id, debit: asset ? opening.toFixed(4) : '0', credit: asset ? '0' : opening.toFixed(4), currencyCode: profile.baseCurrencyCode, baseCurrencyAmount: opening.toFixed(4) },
          { ledgerAccountId: equity.id, debit: asset ? '0' : opening.toFixed(4), credit: asset ? opening.toFixed(4) : '0', currencyCode: profile.baseCurrencyCode, baseCurrencyAmount: opening.toFixed(4) },
        ] },
      } });
    }
    await database.auditEvent.create({ data: { userId: ownerId, profileId, action: 'CREATED', recordType: 'FINANCIAL_ACCOUNT', recordId: account.id, newValues: { name: account.name, type: account.type } } });
    return account;
  });
}
