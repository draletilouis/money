import { describe, expect, it } from 'vitest';
import { goalMovementBalance, goalSchedule } from './goal.js';

describe('goal progress', () => {
  it('derives the balance from opening, contribution, and withdrawal movements', () => {
    expect(goalMovementBalance([
      { type: 'OPENING_BALANCE', amount: 100 }, { type: 'CONTRIBUTION', amount: 75 }, { type: 'WITHDRAWAL', amount: 25 },
    ]).toFixed(2)).toBe('150.00');
  });

  it('calculates a monthly contribution and schedule status', () => {
    expect(goalSchedule(1200, 300, new Date('2027-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'))).toMatchObject({
      remainingAmount: '900.00', requiredMonthlyContribution: '150.00', monthsRemaining: 6, scheduleStatus: 'BEHIND',
    });
  });

  it('marks a reached target as completed', () => {
    expect(goalSchedule(1000, 1000, new Date('2027-01-01'))).toMatchObject({ remainingAmount: '0.00', scheduleStatus: 'COMPLETED' });
  });

  it('keeps the target date available through the end of that day', () => {
    expect(goalSchedule(1000, 500, new Date('2027-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T12:00:00Z')).scheduleStatus).not.toBe('OVERDUE');
  });
});
