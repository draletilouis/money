import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { AppError } from '../lib/http.js';
import { createPostedTransactionInDatabase } from './transaction-service.js';
import type { PlanningSettlementInput } from '../../../shared/contracts.js';
import { inclusiveBudgetRange } from '../domain/budget.js';

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

export async function assertNoBudgetOverlap(profileId: string, categoryId: string, startDate: Date, endDate: Date, excludeBudgetId?: string) {
  const overlapping = await prisma.budget.findFirst({ where: {
    profileId, categoryId, status: 'ACTIVE', id: excludeBudgetId ? { not: excludeBudgetId } : undefined,
    startDate: { lte: endDate }, endDate: { gte: startDate },
  } });
  if (overlapping) throw new AppError(409, `This period overlaps the active budget “${overlapping.name}” for the same category.`);
}

export async function getBudgetMovements(userId: string, profileId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, profileId, profile: { ownerId: userId } }, include: { category: true } });
  if (!budget) throw new AppError(404, 'Budget not found.');
  const range = inclusiveBudgetRange(budget.startDate, budget.endDate);
  const movements = await prisma.transaction.findMany({
    where: { profileId, categoryId: budget.categoryId, type: 'MONEY_OUT', status: 'POSTED', transactionDate: { gte: range.start, lte: range.end } },
    include: { fromAccount: true }, orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
  });
  const spent = movements.reduce((sum, item) => sum + Number(item.baseAmount), 0);
  return { budget, spent: spent.toFixed(2), remaining: (Number(budget.amount) - spent).toFixed(2), movements };
}

export async function payBill(userId: string, profileId: string, billId: string, input: PlanningSettlementInput) {
  try {
    return await prisma.$transaction(async (database) => {
      const bill = await database.bill.findFirst({ where: { id: billId, profileId, profile: { ownerId: userId } } });
      if (!bill) throw new AppError(404, 'Bill not found.');
      if (bill.status === 'PAID' || bill.transactionId) throw new AppError(409, 'This bill has already been paid.');
      if (bill.status === 'CANCELLED') throw new AppError(409, 'A cancelled bill cannot be paid.');
      const transaction = await createPostedTransactionInDatabase(database, userId, profileId, {
        type: 'MONEY_OUT', amount: Number(bill.amount), feeAmount: 0, fromAccountId: input.accountId, categoryId: bill.categoryId,
        transactionDate: input.transactionDate, counterparty: bill.payee, description: `Bill payment: ${bill.payee}`, idempotencyKey: `bill-payment-${bill.id}`,
      });
      return database.bill.update({ where: { id: bill.id }, data: { status: 'PAID', transactionId: transaction.id, paymentAccountId: input.accountId } });
    }, transactionOptions);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new AppError(409, 'This bill was already processed. Refresh and try again.');
    throw error;
  }
}

export async function receiveExpectedIncome(userId: string, profileId: string, incomeId: string, input: PlanningSettlementInput) {
  try {
    return await prisma.$transaction(async (database) => {
      const income = await database.expectedIncome.findFirst({ where: { id: incomeId, profileId, profile: { ownerId: userId } } });
      if (!income) throw new AppError(404, 'Expected income not found.');
      if (income.status === 'RECEIVED' || income.transactionId) throw new AppError(409, 'This income has already been received.');
      if (income.status === 'CANCELLED') throw new AppError(409, 'Cancelled income cannot be received.');
      const transaction = await createPostedTransactionInDatabase(database, userId, profileId, {
        type: 'MONEY_IN', amount: Number(income.amount), feeAmount: 0, toAccountId: input.accountId, categoryId: income.categoryId,
        transactionDate: input.transactionDate, counterparty: income.source, description: `Expected income received: ${income.source}`, idempotencyKey: `expected-income-${income.id}`,
      });
      return database.expectedIncome.update({ where: { id: income.id }, data: { status: 'RECEIVED', transactionId: transaction.id, destinationAccountId: input.accountId } });
    }, transactionOptions);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new AppError(409, 'This income was already processed. Refresh and try again.');
    throw error;
  }
}
