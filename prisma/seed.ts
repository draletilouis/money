import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../server/src/lib/db.js';
import { createFinancialAccount, createProfile } from '../server/src/services/profile-service.js';
import { createPostedTransaction } from '../server/src/services/transaction-service.js';
import { createCategory } from '../server/src/services/category-service.js';

async function seed() {
  await prisma.currency.upsert({ where: { code: 'UGX' }, create: { code: 'UGX', name: 'Ugandan Shilling', symbol: 'UGX', decimalPlaces: 0 }, update: {} });
  await prisma.currency.upsert({ where: { code: 'USD' }, create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 }, update: {} });
  const user = await prisma.user.upsert({
    where: { email: 'owner@moneymanager.local' },
    create: { name: 'Money Manager Owner', email: 'owner@moneymanager.local', passwordHash: await bcrypt.hash('MoneyManager2026!', 12) },
    update: {},
  });

  if (await prisma.profile.count({ where: { ownerId: user.id } })) {
    console.log('Seed data already exists; skipping financial records.');
    return;
  }

  const definitions = [
    { name: 'Personal', type: 'PERSONAL' as const, description: 'Household and personal finances' },
    { name: 'Island Farm', type: 'BUSINESS' as const, description: 'Farm operations and assets' },
    { name: 'Restaurant', type: 'BUSINESS' as const, description: 'Restaurant trading profile' },
  ];

  for (const definition of definitions) {
    const profile = await createProfile(user.id, { ...definition, baseCurrencyCode: 'UGX', financialYearStart: 1 });
    const cash = await createFinancialAccount(user.id, profile.id, { name: 'Cash', type: 'CASH', currencyCode: 'UGX', openingBalance: definition.name === 'Personal' ? 450_000 : 1_200_000, openingBalanceDate: new Date('2026-07-01'), includeInAvailableCash: true, includeInNetWorth: true });
    const bank = await createFinancialAccount(user.id, profile.id, { name: 'Stanbic Bank', type: 'BANK', institution: 'Stanbic Bank Uganda', currencyCode: 'UGX', openingBalance: definition.name === 'Personal' ? 8_500_000 : 12_000_000, openingBalanceDate: new Date('2026-07-01'), includeInAvailableCash: true, includeInNetWorth: true });
    const mobile = await createFinancialAccount(user.id, profile.id, { name: 'MTN Mobile Money', type: 'MOBILE_MONEY', institution: 'MTN Uganda', currencyCode: 'UGX', openingBalance: 620_000, openingBalanceDate: new Date('2026-07-01'), includeInAvailableCash: true, includeInNetWorth: true });
    const business = definition.type === 'BUSINESS';
    const categoryDefinitions = business
      ? [['Sales', 'INCOME'], ['Fuel', 'EXPENSE'], ['Utilities', 'EXPENSE']] as const
      : [['Salary', 'INCOME'], ['Other income', 'INCOME'], ['Food', 'EXPENSE'], ['Utilities', 'EXPENSE']] as const;
    for (const [name, type] of categoryDefinitions) await createCategory(user.id, profile.id, { name, type, attachmentRequired: false });
    const categories = await prisma.category.findMany({ where: { profileId: profile.id } });
    const category = (name: string) => categories.find((item) => item.name === name)!.id;

    await createPostedTransaction(user.id, profile.id, { type: 'MONEY_IN', amount: business ? 4_800_000 : 5_500_000, feeAmount: 0, toAccountId: bank.id, categoryId: category(business ? 'Sales' : 'Salary'), transactionDate: new Date('2026-07-04'), counterparty: business ? 'Weekly customers' : 'Employer', description: business ? 'Weekly receipts' : 'July salary', idempotencyKey: `seed-${profile.id}-income` });
    await createPostedTransaction(user.id, profile.id, { type: 'MONEY_OUT', amount: business ? 540_000 : 310_000, feeAmount: 0, fromAccountId: mobile.id, categoryId: category(business ? 'Fuel' : 'Food'), transactionDate: new Date('2026-07-07'), counterparty: business ? 'Shell Uganda' : 'Capital Shoppers', description: business ? 'Operations fuel' : 'Household groceries', idempotencyKey: `seed-${profile.id}-expense` });
    await createPostedTransaction(user.id, profile.id, { type: 'TRANSFER', amount: 300_000, feeAmount: 1_500, fromAccountId: bank.id, toAccountId: cash.id, transactionDate: new Date('2026-07-09'), description: 'Cash withdrawal', idempotencyKey: `seed-${profile.id}-transfer` });

    await prisma.budget.create({ data: { profileId: profile.id, categoryId: category(business ? 'Fuel' : 'Food'), name: `${business ? 'Fuel' : 'Food'} budget`, amount: business ? 2_000_000 : 1_200_000, startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), alertThreshold: 80 } });
    await prisma.bill.create({ data: { profileId: profile.id, categoryId: category('Utilities'), payee: 'UMEME', amount: business ? 850_000 : 180_000, dueDate: new Date('2026-07-25'), notes: 'July electricity bill' } });
    await prisma.expectedIncome.create({ data: { profileId: profile.id, categoryId: category(business ? 'Sales' : 'Other income'), source: business ? 'Corporate customer' : 'Consulting client', amount: business ? 3_200_000 : 900_000, expectedDate: new Date('2026-07-29'), destinationAccountId: bank.id } });

    if (definition.name === 'Personal') {
      await prisma.asset.create({ data: { profileId: profile.id, name: 'Toyota Harrier', assetType: 'Vehicle', purchaseDate: new Date('2024-06-12'), purchaseValue: 48_000_000, currentEstimatedValue: 41_500_000, valuationDate: new Date('2026-07-01'), valuations: { create: { value: 41_500_000, valuedAt: new Date('2026-07-01'), notes: 'Current market estimate' } } } });
      await prisma.debt.create({ data: { profileId: profile.id, direction: 'OWED_BY_PROFILE', counterparty: 'Stanbic Vehicle Loan', originalAmount: 30_000_000, currentBalance: 18_400_000, interestRate: 0.165, startDate: new Date('2024-06-12'), dueDate: new Date('2028-06-12'), relatedAccountId: bank.id } });
    } else {
      await prisma.asset.create({ data: { profileId: profile.id, name: definition.name === 'Island Farm' ? 'Farm equipment' : 'Kitchen equipment', assetType: 'Equipment', purchaseDate: new Date('2025-02-01'), purchaseValue: 22_000_000, currentEstimatedValue: 18_500_000, valuationDate: new Date('2026-07-01'), valuations: { create: { value: 18_500_000, valuedAt: new Date('2026-07-01') } } } });
    }
  }
  console.log('Money Manager development data seeded.');
}

seed().finally(() => prisma.$disconnect());
