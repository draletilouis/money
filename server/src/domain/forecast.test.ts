import { describe, expect, it } from 'vitest';
import { buildCashForecast } from './forecast.js';

describe('cash forecast', () => {
  const asOf = new Date('2026-07-21T09:00:00Z');

  it('projects bills and expected income into each horizon', () => {
    const result = buildCashForecast('1000', [
      { amount: '300', date: '2026-07-23T00:00:00Z' },
      { amount: '200', date: '2026-08-10T00:00:00Z' },
    ], [
      { amount: '500', date: '2026-07-25T00:00:00Z' },
      { amount: '800', date: '2026-09-01T00:00:00Z' },
    ], asOf);
    expect(result.horizons[0]).toMatchObject({ bills: '300.00', expectedIncome: '500.00', projectedAvailable: '1200.00' });
    expect(result.horizons[1]).toMatchObject({ bills: '500.00', expectedIncome: '500.00', projectedAvailable: '1000.00' });
    expect(result.horizons[2]).toMatchObject({ bills: '500.00', expectedIncome: '1300.00', projectedAvailable: '1800.00' });
  });

  it('includes overdue commitments in every forward horizon', () => {
    const result = buildCashForecast(1000, [{ amount: 250, date: '2026-07-01' }], [], asOf);
    expect(result.horizons.every((item) => item.projectedAvailable === '750.00')).toBe(true);
  });
});
