import { Prisma, type CategoryType } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { AppError } from '../lib/http.js';

type CategoryInput = { name: string; type: 'INCOME' | 'EXPENSE'; attachmentRequired: boolean };
type CategoryUpdateInput = Pick<CategoryInput, 'name' | 'attachmentRequired'>;

export function nextCategoryLedgerCode(type: 'INCOME' | 'EXPENSE', existingCodes: string[]) {
  const floor = type === 'INCOME' ? 4000 : 5000;
  const ceiling = type === 'INCOME' ? 4999 : 5999;
  const used = new Set(existingCodes.map(Number).filter((code) => Number.isInteger(code) && code >= floor && code <= ceiling));
  for (let code = floor + 1; code <= ceiling; code += 1) if (!used.has(code)) return String(code);
  throw new AppError(409, `No more ${type.toLowerCase()} category codes are available.`);
}

async function ownedCategory(database: Prisma.TransactionClient, ownerId: string, profileId: string, categoryId: string) {
  const category = await database.category.findFirst({ where: { id: categoryId, profileId, profile: { ownerId } }, include: { ledgerAccount: true } });
  if (!category) throw new AppError(404, 'Category not found.');
  return category;
}

async function assertUniqueName(database: Prisma.TransactionClient, profileId: string, type: CategoryType, name: string, excludeId?: string) {
  const duplicate = await database.category.findFirst({ where: { profileId, type, name: { equals: name, mode: 'insensitive' }, id: excludeId ? { not: excludeId } : undefined } });
  if (duplicate) throw new AppError(409, duplicate.active ? `A ${type.toLowerCase()} category named “${name}” already exists.` : `“${name}” is archived. Restore it instead of creating a duplicate.`);
}

export async function createCategory(ownerId: string, profileId: string, input: CategoryInput) {
  try {
    return await prisma.$transaction(async (database) => {
      const profile = await database.profile.findFirst({ where: { id: profileId, ownerId, status: 'ACTIVE' } });
      if (!profile) throw new AppError(404, 'Profile not found.');
      await assertUniqueName(database, profileId, input.type, input.name);
      const parentKey = input.type === 'INCOME' ? 'INCOME' : 'EXPENSES';
      const parent = await database.ledgerAccount.findFirstOrThrow({ where: { profileId, systemKey: parentKey } });
      const existing = await database.ledgerAccount.findMany({ where: { profileId, accountClass: input.type }, select: { code: true } });
      const ledger = await database.ledgerAccount.create({ data: {
        profileId, code: nextCategoryLedgerCode(input.type, existing.map((item) => item.code)), name: input.name,
        accountClass: input.type, parentId: parent.id,
      } });
      const category = await database.category.create({ data: { profileId, ledgerAccountId: ledger.id, ...input } });
      await database.auditEvent.create({ data: { userId: ownerId, profileId, action: 'CREATED', recordType: 'CATEGORY', recordId: category.id, newValues: { name: category.name, type: category.type } } });
      return category;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new AppError(409, 'That category changed while it was being saved. Refresh and try again.');
    throw error;
  }
}

export async function updateCategory(ownerId: string, profileId: string, categoryId: string, input: CategoryUpdateInput) {
  return prisma.$transaction(async (database) => {
    const category = await ownedCategory(database, ownerId, profileId, categoryId);
    await assertUniqueName(database, profileId, category.type, input.name, category.id);
    const updated = await database.category.update({ where: { id: category.id }, data: input });
    await database.ledgerAccount.update({ where: { id: category.ledgerAccountId }, data: { name: input.name } });
    await database.budget.updateMany({ where: { categoryId: category.id }, data: { name: `${input.name} budget` } });
    await database.auditEvent.create({ data: { userId: ownerId, profileId, action: 'UPDATED', recordType: 'CATEGORY', recordId: category.id, newValues: { name: updated.name, attachmentRequired: updated.attachmentRequired } } });
    return updated;
  });
}

export async function archiveCategory(ownerId: string, profileId: string, categoryId: string) {
  return prisma.$transaction(async (database) => {
    const category = await ownedCategory(database, ownerId, profileId, categoryId);
    if (!category.active) throw new AppError(409, 'This category is already archived.');
    const [budgets, bills, income] = await Promise.all([
      database.budget.count({ where: { profileId, categoryId, status: 'ACTIVE' } }),
      database.bill.count({ where: { profileId, categoryId, status: { notIn: ['PAID', 'CANCELLED'] } } }),
      database.expectedIncome.count({ where: { profileId, categoryId, status: { notIn: ['RECEIVED', 'CANCELLED'] } } }),
    ]);
    if (budgets || bills || income) throw new AppError(409, 'Archive or settle this category’s active budgets, bills, and expected income first.');
    const updated = await database.category.update({ where: { id: category.id }, data: { active: false } });
    await database.ledgerAccount.update({ where: { id: category.ledgerAccountId }, data: { active: false } });
    await database.auditEvent.create({ data: { userId: ownerId, profileId, action: 'ARCHIVED', recordType: 'CATEGORY', recordId: category.id } });
    return updated;
  });
}

export async function restoreCategory(ownerId: string, profileId: string, categoryId: string) {
  return prisma.$transaction(async (database) => {
    const category = await ownedCategory(database, ownerId, profileId, categoryId);
    if (category.active) throw new AppError(409, 'This category is already active.');
    const updated = await database.category.update({ where: { id: category.id }, data: { active: true } });
    await database.ledgerAccount.update({ where: { id: category.ledgerAccountId }, data: { active: true } });
    await database.auditEvent.create({ data: { userId: ownerId, profileId, action: 'RESTORED', recordType: 'CATEGORY', recordId: category.id } });
    return updated;
  });
}
