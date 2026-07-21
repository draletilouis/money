import { Decimal } from 'decimal.js';

export type PostingType = 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER' | 'OWNER_CONTRIBUTION' | 'OWNER_WITHDRAWAL' | 'LOAN_RECEIVED' | 'LOAN_REPAYMENT' | 'ASSET_PURCHASE';

export type PostingInput = {
  type: PostingType;
  amount: Decimal.Value;
  feeAmount?: Decimal.Value;
  fromLedgerAccountId?: string;
  toLedgerAccountId?: string;
  categoryLedgerAccountId?: string;
  feeLedgerAccountId?: string;
  currencyCode: string;
  description?: string;
};

export type PostingLine = {
  ledgerAccountId: string;
  debit: string;
  credit: string;
  currencyCode: string;
  baseCurrencyAmount: string;
  description?: string;
};

const zero = new Decimal(0);
const line = (ledgerAccountId: string | undefined, debit: Decimal, credit: Decimal, input: PostingInput): PostingLine => {
  if (!ledgerAccountId) throw new Error('A required ledger account is missing.');
  if (debit.isNegative() || credit.isNegative() || (debit.isZero() && credit.isZero()) || (!debit.isZero() && !credit.isZero())) {
    throw new Error('Each journal line must contain one positive debit or credit.');
  }
  return {
    ledgerAccountId,
    debit: debit.toFixed(4),
    credit: credit.toFixed(4),
    currencyCode: input.currencyCode,
    baseCurrencyAmount: debit.plus(credit).toFixed(4),
    description: input.description,
  };
};

export function buildPostingLines(input: PostingInput): PostingLine[] {
  const amount = new Decimal(input.amount);
  const fee = new Decimal(input.feeAmount ?? 0);
  if (!amount.isPositive()) throw new Error('Amount must be greater than zero.');
  if (fee.isNegative()) throw new Error('Transfer fee cannot be negative.');

  let lines: PostingLine[];
  switch (input.type) {
    case 'MONEY_IN':
    case 'OWNER_CONTRIBUTION':
    case 'LOAN_RECEIVED':
      lines = [line(input.toLedgerAccountId, amount, zero, input), line(input.categoryLedgerAccountId, zero, amount, input)];
      break;
    case 'MONEY_OUT':
    case 'OWNER_WITHDRAWAL':
    case 'LOAN_REPAYMENT':
    case 'ASSET_PURCHASE':
      lines = [line(input.categoryLedgerAccountId, amount, zero, input), line(input.fromLedgerAccountId, zero, amount, input)];
      break;
    case 'TRANSFER':
      if (input.fromLedgerAccountId === input.toLedgerAccountId) throw new Error('Transfer accounts must be different.');
      lines = [line(input.toLedgerAccountId, amount, zero, input), line(input.fromLedgerAccountId, zero, amount.plus(fee), input)];
      if (fee.isPositive()) lines.push(line(input.feeLedgerAccountId, fee, zero, input));
      break;
  }
  assertBalanced(lines);
  return lines;
}

export function assertBalanced(lines: PostingLine[]) {
  if (lines.length < 2) throw new Error('A journal entry requires at least two lines.');
  const debits = Decimal.sum(...lines.map((item) => item.debit));
  const credits = Decimal.sum(...lines.map((item) => item.credit));
  if (!debits.equals(credits)) throw new Error(`Journal entry is not balanced: debits ${debits} and credits ${credits}.`);
}

export function signedBalance(accountClass: string, debit: Decimal.Value, credit: Decimal.Value) {
  const normalDebit = accountClass === 'ASSET' || accountClass === 'EXPENSE';
  return normalDebit ? new Decimal(debit).minus(credit) : new Decimal(credit).minus(debit);
}

export function reverseLines(lines: PostingLine[]): PostingLine[] {
  const reversed = lines.map((item) => ({ ...item, debit: item.credit, credit: item.debit }));
  assertBalanced(reversed);
  return reversed;
}
