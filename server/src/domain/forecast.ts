import { Decimal } from 'decimal.js';

type ForecastItem = { amount: string | number; date: string | Date };

const totalThrough = (items: ForecastItem[], cutoff: Date) => items.reduce((total, item) => {
  const date = new Date(item.date);
  return date <= cutoff ? total.plus(item.amount) : total;
}, new Decimal(0));

export function buildCashForecast(currentAvailable: string | number, bills: ForecastItem[], expectedIncome: ForecastItem[], asOf = new Date()) {
  const start = new Date(asOf); start.setHours(0, 0, 0, 0);
  const available = new Decimal(currentAvailable);
  const horizons = [7, 30, 90].map((days) => {
    const cutoff = new Date(start); cutoff.setDate(cutoff.getDate() + days); cutoff.setHours(23, 59, 59, 999);
    const outgoing = totalThrough(bills, cutoff); const incoming = totalThrough(expectedIncome, cutoff);
    return { days, through: cutoff.toISOString(), bills: outgoing.toFixed(2), expectedIncome: incoming.toFixed(2), projectedAvailable: available.plus(incoming).minus(outgoing).toFixed(2) };
  });
  return { asOf: start.toISOString(), currentAvailable: available.toFixed(2), horizons };
}
