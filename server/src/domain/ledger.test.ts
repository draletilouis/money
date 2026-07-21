import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { assertBalanced, buildPostingLines, reverseLines, signedBalance } from './ledger.js';

const base = { amount: '125000.00', currencyCode: 'UGX', description: 'Test entry' };

describe('ledger posting rules', () => {
  it('posts Money In as cash debit and income credit', () => {
    const lines = buildPostingLines({ ...base, type: 'MONEY_IN', toLedgerAccountId: 'cash', categoryLedgerAccountId: 'income' });
    expect(lines).toEqual([
      expect.objectContaining({ ledgerAccountId: 'cash', debit: '125000.0000', credit: '0.0000' }),
      expect.objectContaining({ ledgerAccountId: 'income', debit: '0.0000', credit: '125000.0000' }),
    ]);
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it('posts Money Out as expense debit and cash credit', () => {
    const lines = buildPostingLines({ ...base, type: 'MONEY_OUT', fromLedgerAccountId: 'cash', categoryLedgerAccountId: 'fuel' });
    expect(lines[0]).toMatchObject({ ledgerAccountId: 'fuel', debit: '125000.0000' });
    expect(lines[1]).toMatchObject({ ledgerAccountId: 'cash', credit: '125000.0000' });
  });

  it('posts a transfer fee without creating income', () => {
    const lines = buildPostingLines({ ...base, type: 'TRANSFER', feeAmount: '2500', fromLedgerAccountId: 'bank', toLedgerAccountId: 'cash', feeLedgerAccountId: 'fees' });
    expect(lines).toHaveLength(3);
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ ledgerAccountId: 'cash', debit: '125000.0000' }),
      expect.objectContaining({ ledgerAccountId: 'bank', credit: '127500.0000' }),
      expect.objectContaining({ ledgerAccountId: 'fees', debit: '2500.0000' }),
    ]));
  });

  it('rejects same-account transfers', () => {
    expect(() => buildPostingLines({ ...base, type: 'TRANSFER', fromLedgerAccountId: 'cash', toLedgerAccountId: 'cash' })).toThrow('different');
  });

  it('creates a balanced reversal', () => {
    const original = buildPostingLines({ ...base, type: 'MONEY_OUT', fromLedgerAccountId: 'cash', categoryLedgerAccountId: 'fuel' });
    const reversed = reverseLines(original);
    expect(reversed[0].credit).toBe(original[0].debit);
    expect(() => assertBalanced(reversed)).not.toThrow();
  });

  it('uses normal account balance signs', () => {
    expect(signedBalance('ASSET', 150, 20).equals(new Decimal(130))).toBe(true);
    expect(signedBalance('INCOME', 20, 150).equals(new Decimal(130))).toBe(true);
  });
});
