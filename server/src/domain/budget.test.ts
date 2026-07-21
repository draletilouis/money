import { describe, expect, it } from 'vitest';
import { budgetRangesOverlap, inclusiveBudgetRange } from './budget.js';

describe('budget date rules', () => {
  it('includes the entire final day', () => {
    const range = inclusiveBudgetRange('2026-07-01', '2026-07-31');
    expect(range.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-07-31T23:59:59.999Z');
  });

  it('treats touching category periods as overlapping', () => {
    expect(budgetRangesOverlap('2026-07-01', '2026-07-31', '2026-07-31', '2026-08-31')).toBe(true);
    expect(budgetRangesOverlap('2026-07-01', '2026-07-31', '2026-08-01', '2026-08-31')).toBe(false);
  });
});
