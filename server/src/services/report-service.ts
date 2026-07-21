import { Decimal } from 'decimal.js';
import { prisma } from '../lib/db.js';
import { AppError } from '../lib/http.js';
import { signedBalance } from '../domain/ledger.js';

export async function assertProfileAccess(userId: string, profileId: string) {
  const profile = await prisma.profile.findFirst({ where: { id: profileId, ownerId: userId, status: 'ACTIVE' } });
  if (!profile) throw new AppError(404, 'Profile not found.');
  return profile;
}

export async function ledgerBalances(userId: string, profileId: string) {
  await assertProfileAccess(userId, profileId);
  const accounts = await prisma.ledgerAccount.findMany({
    where: { profileId },
    include: { journalLines: true },
    orderBy: { code: 'asc' },
  });
  return accounts.map((account) => {
    const balance = account.journalLines.reduce((total, item) => total.plus(signedBalance(account.accountClass, item.debit.toString(), item.credit.toString())), new Decimal(0));
    return { id: account.id, code: account.code, name: account.name, accountClass: account.accountClass, balance: balance.toFixed(2) };
  });
}

export async function accountSummaries(userId: string, profileId: string) {
  await assertProfileAccess(userId, profileId);
  const accounts = await prisma.financialAccount.findMany({
    where: { profileId, status: 'ACTIVE' }, include: { ledgerAccount: { include: { journalLines: { include: { journalEntry: true } } } } }, orderBy: { createdAt: 'asc' },
  });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return accounts.map((account) => {
    let balance = new Decimal(0); let inflow = new Decimal(0); let outflow = new Decimal(0); let lastActivity: Date | null = null;
    for (const item of account.ledgerAccount.journalLines) {
      balance = balance.plus(signedBalance(account.ledgerAccount.accountClass, item.debit.toString(), item.credit.toString()));
      if (item.journalEntry.entryDate >= monthStart) {
        inflow = inflow.plus(item.debit); outflow = outflow.plus(item.credit);
      }
      if (!lastActivity || item.journalEntry.entryDate > lastActivity) lastActivity = item.journalEntry.entryDate;
    }
    return { id: account.id, name: account.name, type: account.type, institution: account.institution, currencyCode: account.currencyCode, balance: balance.toFixed(2), monthlyInflow: inflow.toFixed(2), monthlyOutflow: outflow.toFixed(2), lastActivity, includeInAvailableCash: account.includeInAvailableCash };
  });
}

export async function dashboard(userId: string, profileId: string) {
  const profile = await assertProfileAccess(userId, profileId);
  const [accounts, transactions, balances, assets, debts, bills] = await Promise.all([
    accountSummaries(userId, profileId),
    prisma.transaction.findMany({ where: { profileId }, include: { fromAccount: true, toAccount: true, category: true, attachments: true }, orderBy: { transactionDate: 'desc' }, take: 8 }),
    ledgerBalances(userId, profileId),
    prisma.asset.aggregate({ where: { profileId, status: 'ACTIVE', includeInNetWorth: true }, _sum: { currentEstimatedValue: true } }),
    prisma.debt.groupBy({ by: ['direction'], where: { profileId, status: { in: ['ACTIVE', 'OVERDUE'] } }, _sum: { currentBalance: true } }),
    prisma.bill.findMany({ where: { profileId, status: { in: ['UPCOMING', 'DUE', 'OVERDUE'] } }, orderBy: { dueDate: 'asc' }, take: 5 }),
  ]);
  const income = balances.filter((item) => item.accountClass === 'INCOME').reduce((sum, item) => sum.plus(item.balance), new Decimal(0));
  const expenses = balances.filter((item) => item.accountClass === 'EXPENSE').reduce((sum, item) => sum.plus(item.balance), new Decimal(0));
  const available = accounts.filter((item) => item.includeInAvailableCash).reduce((sum, item) => sum.plus(item.balance), new Decimal(0));
  const assetAccounts = balances.filter((item) => item.accountClass === 'ASSET').reduce((sum, item) => sum.plus(item.balance), new Decimal(0));
  const liabilities = balances.filter((item) => item.accountClass === 'LIABILITY').reduce((sum, item) => sum.plus(item.balance), new Decimal(0));
  const debtBalance = (direction: string) => new Decimal(debts.find((item) => item.direction === direction)?._sum.currentBalance?.toString() ?? 0);
  return {
    profile,
    metrics: { available: available.toFixed(2), moneyIn: income.toFixed(2), moneyOut: expenses.toFixed(2), netCashFlow: income.minus(expenses).toFixed(2), owedToProfile: debtBalance('OWED_TO_PROFILE').toFixed(2), owedByProfile: debtBalance('OWED_BY_PROFILE').toFixed(2), netWorth: assetAccounts.plus(assets._sum.currentEstimatedValue?.toString() ?? 0).plus(debtBalance('OWED_TO_PROFILE')).minus(liabilities).minus(debtBalance('OWED_BY_PROFILE')).toFixed(2) },
    accounts, recentTransactions: transactions, upcoming: bills,
  };
}
