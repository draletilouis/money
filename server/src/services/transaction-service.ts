import { Prisma, type TransactionType } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { AppError } from '../lib/http.js';
import { buildPostingLines } from '../domain/ledger.js';
import type { TransactionInput } from '../../../shared/contracts.js';

export async function createPostedTransaction(userId: string, profileId: string, input: TransactionInput) {
  try {
    return await prisma.$transaction((database) => createPostedTransactionInDatabase(database, userId, profileId, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'This transaction was already posted.');
    throw error;
  }
}

export async function createPostedTransactionInDatabase(database: Prisma.TransactionClient, userId: string, profileId: string, input: TransactionInput) {
      const profile = await database.profile.findFirst({ where: { id: profileId, ownerId: userId, status: 'ACTIVE' } });
      if (!profile) throw new AppError(404, 'Profile not found.');

      const accountIds = [input.fromAccountId, input.toAccountId].filter(Boolean) as string[];
      const accounts = await database.financialAccount.findMany({ where: { id: { in: accountIds }, profileId, status: 'ACTIVE' }, include: { ledgerAccount: true } });
      if (accounts.length !== new Set(accountIds).size) throw new AppError(400, 'Every selected account must be active and belong to this profile.');
      const from = accounts.find((account) => account.id === input.fromAccountId);
      const to = accounts.find((account) => account.id === input.toAccountId);

      const category = input.categoryId ? await database.category.findFirst({ where: { id: input.categoryId, profileId, active: true }, include: { ledgerAccount: true } }) : null;
      if (input.type === 'MONEY_IN' && category?.type !== 'INCOME') throw new AppError(400, 'Choose an income category for Money In.');
      if (input.type === 'MONEY_OUT' && category?.type !== 'EXPENSE') throw new AppError(400, 'Choose an expense category for Money Out.');

      const feeAccount = input.feeAmount > 0 ? await database.ledgerAccount.findFirstOrThrow({ where: { profileId, systemKey: 'BANK_FEES' } }) : null;
      const lines = buildPostingLines({
        type: input.type,
        amount: input.amount,
        feeAmount: input.feeAmount,
        fromLedgerAccountId: from?.ledgerAccountId,
        toLedgerAccountId: to?.ledgerAccountId,
        categoryLedgerAccountId: category?.ledgerAccountId,
        feeLedgerAccountId: feeAccount?.id,
        currencyCode: profile.baseCurrencyCode,
        description: input.description,
      });

      const transaction = await database.transaction.create({ data: {
        profileId, type: input.type as TransactionType, status: 'POSTED', amount: input.amount, feeAmount: input.feeAmount,
        baseAmount: input.amount, currencyCode: profile.baseCurrencyCode, transactionDate: input.transactionDate,
        fromAccountId: input.fromAccountId, toAccountId: input.toAccountId, categoryId: input.categoryId,
        counterparty: input.counterparty, description: input.description, reference: input.reference, idempotencyKey: input.idempotencyKey,
      } });
      await database.journalEntry.create({ data: {
        profileId, transactionId: transaction.id, entryDate: input.transactionDate, postingDate: new Date(),
        description: input.description || input.counterparty || input.type.replaceAll('_', ' '), sourceType: 'TRANSACTION', sourceId: transaction.id,
        lines: { create: lines },
      } });
      await database.auditEvent.create({ data: { userId, profileId, action: 'POSTED', recordType: 'TRANSACTION', recordId: transaction.id, newValues: { type: transaction.type, amount: transaction.amount.toString() } } });
      return database.transaction.findUniqueOrThrow({ where: { id: transaction.id }, include: { fromAccount: true, toAccount: true, category: true, attachments: true } });
}

export async function reversePostedTransaction(userId: string, profileId: string, transactionId: string) {
  return prisma.$transaction(async (database) => {
    const original = await database.transaction.findFirst({
      where: { id: transactionId, profileId, profile: { ownerId: userId } },
      include: { journalEntry: { include: { lines: true } } },
    });
    if (!original || !original.journalEntry) throw new AppError(404, 'Posted transaction not found.');
    if (original.status === 'REVERSED' || original.reversedById) throw new AppError(409, 'This transaction has already been reversed.');

    const reversal = await database.transaction.create({ data: {
      profileId, type: 'ADJUSTMENT', status: 'POSTED', amount: original.amount, feeAmount: original.feeAmount,
      currencyCode: original.currencyCode, exchangeRate: original.exchangeRate, baseAmount: original.baseAmount,
      transactionDate: new Date(), description: `Reversal: ${original.description ?? original.type.replaceAll('_', ' ')}`,
      idempotencyKey: `reversal-${original.id}`,
    } });
    await database.journalEntry.create({ data: {
      profileId, transactionId: reversal.id, entryDate: new Date(), postingDate: new Date(),
      description: reversal.description!, sourceType: 'REVERSAL', sourceId: reversal.id, reversalOfId: original.journalEntry.id,
      lines: { create: original.journalEntry.lines.map((item) => ({
        ledgerAccountId: item.ledgerAccountId, debit: item.credit, credit: item.debit,
        currencyCode: item.currencyCode, baseCurrencyAmount: item.baseCurrencyAmount, description: `Reversal of ${item.description ?? original.id}`,
      })) },
    } });
    await database.transaction.update({ where: { id: original.id }, data: { status: 'REVERSED', reversedById: reversal.id } });
    await database.journalEntry.update({ where: { id: original.journalEntry.id }, data: { status: 'REVERSED' } });
    await database.auditEvent.create({ data: { userId, profileId, action: 'REVERSED', recordType: 'TRANSACTION', recordId: original.id, newValues: { reversalId: reversal.id } } });
    return reversal;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
