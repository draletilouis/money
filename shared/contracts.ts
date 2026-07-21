import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const setupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(12).max(128),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['PERSONAL', 'BUSINESS', 'INVESTMENT', 'PROJECT', 'OTHER']),
  description: z.string().trim().max(500).optional(),
  baseCurrencyCode: z.string().length(3).transform((value) => value.toUpperCase()).default('UGX'),
  financialYearStart: z.coerce.number().int().min(1).max(12).default(1),
});

export const accountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['BANK', 'MOBILE_MONEY', 'CASH', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'PETTY_CASH', 'LOAN', 'OTHER']),
  institution: z.string().trim().max(100).optional(),
  currencyCode: z.string().length(3).transform((value) => value.toUpperCase()).default('UGX'),
  openingBalance: z.coerce.number().min(0).default(0),
  openingBalanceDate: z.coerce.date().optional(),
  includeInAvailableCash: z.boolean().default(true),
  includeInNetWorth: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['INCOME', 'EXPENSE', 'ASSET', 'DEBT']),
  ledgerAccountId: z.string().min(1),
  parentId: z.string().optional(),
  attachmentRequired: z.boolean().default(false),
});

export const transactionSchema = z.object({
  type: z.enum(['MONEY_IN', 'MONEY_OUT', 'TRANSFER']),
  amount: z.coerce.number().positive().max(999_999_999_999),
  feeAmount: z.coerce.number().min(0).default(0),
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  transactionDate: z.coerce.date(),
  counterparty: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  reference: z.string().trim().max(100).optional(),
  idempotencyKey: z.string().min(8).max(100),
}).superRefine((data, context) => {
  if (data.type === 'MONEY_IN' && (!data.toAccountId || !data.categoryId)) {
    context.addIssue({ code: 'custom', message: 'Money In requires a deposit account and category.' });
  }
  if (data.type === 'MONEY_OUT' && (!data.fromAccountId || !data.categoryId)) {
    context.addIssue({ code: 'custom', message: 'Money Out requires a payment account and category.' });
  }
  if (data.type === 'TRANSFER') {
    if (!data.fromAccountId || !data.toAccountId) {
      context.addIssue({ code: 'custom', message: 'A transfer requires both accounts.' });
    }
    if (data.fromAccountId === data.toAccountId) {
      context.addIssue({ code: 'custom', message: 'Choose two different accounts for a transfer.' });
    }
  }
});

export const assetSchema = z.object({
  name: z.string().trim().min(2).max(100),
  assetType: z.string().trim().min(2).max(50),
  purchaseDate: z.coerce.date().optional(),
  purchaseValue: z.coerce.number().min(0).default(0),
  currentEstimatedValue: z.coerce.number().min(0),
  valuationDate: z.coerce.date(),
  description: z.string().trim().max(1000).optional(),
  includeInNetWorth: z.boolean().default(true),
});

export const budgetSchema = z.object({
  name: z.string().trim().min(2).max(100),
  categoryId: z.string().min(1),
  amount: z.coerce.number().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  alertThreshold: z.coerce.number().int().min(1).max(100).default(80),
}).refine((data) => data.endDate >= data.startDate, { message: 'Budget end date must be after its start date.', path: ['endDate'] });

export const billSchema = z.object({
  payee: z.string().trim().min(2).max(120),
  amount: z.coerce.number().positive().max(999_999_999_999),
  dueDate: z.coerce.date(),
  categoryId: z.string().min(1),
  paymentAccountId: z.string().min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const expectedIncomeSchema = z.object({
  source: z.string().trim().min(2).max(120),
  amount: z.coerce.number().positive().max(999_999_999_999),
  expectedDate: z.coerce.date(),
  categoryId: z.string().min(1),
  destinationAccountId: z.string().min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const goalSchema = z.object({
  name: z.string().trim().min(2).max(120),
  goalType: z.enum(['SAVINGS', 'EMERGENCY_FUND', 'PURCHASE', 'DEBT_REPAYMENT', 'INVESTMENT', 'OTHER']),
  targetAmount: z.coerce.number().positive().max(999_999_999_999),
  currentAmount: z.coerce.number().min(0).max(999_999_999_999).default(0),
  targetDate: z.coerce.date().optional(),
  linkedAccountId: z.string().min(1).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const planningSettlementSchema = z.object({
  accountId: z.string().min(1),
  transactionDate: z.coerce.date(),
});

export const goalProgressSchema = z.object({
  currentAmount: z.coerce.number().min(0).max(999_999_999_999),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type AssetInput = z.infer<typeof assetSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
export type BillInput = z.infer<typeof billSchema>;
export type ExpectedIncomeInput = z.infer<typeof expectedIncomeSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type PlanningSettlementInput = z.infer<typeof planningSettlementSchema>;
