import { describe, expect, it } from 'vitest';
import { nextCategoryLedgerCode } from './category-service.js';

describe('user category ledger codes', () => {
  it('allocates the next income code without relying on hard-coded category names', () => {
    expect(nextCategoryLedgerCode('INCOME', ['4000', '4001', '4012', '5000'])).toBe('4002');
  });

  it('allocates the next expense code independently', () => {
    expect(nextCategoryLedgerCode('EXPENSE', ['4000', '5000', '5001', '5800'])).toBe('5002');
  });
});
