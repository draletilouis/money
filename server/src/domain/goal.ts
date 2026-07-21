import { Decimal } from 'decimal.js';

export type GoalMovementValue = { type: 'OPENING_BALANCE' | 'CONTRIBUTION' | 'WITHDRAWAL'; amount: Decimal.Value };

export function goalMovementBalance(movements: GoalMovementValue[]) {
  return movements.reduce((balance, movement) => movement.type === 'WITHDRAWAL' ? balance.minus(movement.amount) : balance.plus(movement.amount), new Decimal(0));
}

export function goalSchedule(targetAmount: Decimal.Value, currentAmount: Decimal.Value, targetDate?: Date | null, createdAt = new Date(), asOf = new Date()) {
  const target = new Decimal(targetAmount); const current = new Decimal(currentAmount); const remaining = Decimal.max(0, target.minus(current));
  if (remaining.isZero()) return { remainingAmount: '0.00', requiredMonthlyContribution: '0.00', monthsRemaining: 0, scheduleStatus: 'COMPLETED' as const };
  if (!targetDate) return { remainingAmount: remaining.toFixed(2), requiredMonthlyContribution: null, monthsRemaining: null, scheduleStatus: current.isZero() ? 'NOT_STARTED' as const : 'IN_PROGRESS' as const };

  const deadline = new Date(targetDate); deadline.setUTCHours(23, 59, 59, 999);
  const remainingMs = deadline.getTime() - asOf.getTime();
  if (remainingMs <= 0) return { remainingAmount: remaining.toFixed(2), requiredMonthlyContribution: remaining.toFixed(2), monthsRemaining: 0, scheduleStatus: 'OVERDUE' as const };
  const calendarMonths = (targetDate.getUTCFullYear() - asOf.getUTCFullYear()) * 12 + targetDate.getUTCMonth() - asOf.getUTCMonth();
  const monthsRemaining = Math.max(1, calendarMonths + (targetDate.getUTCDate() > asOf.getUTCDate() ? 1 : 0));
  const totalMs = Math.max(1, deadline.getTime() - createdAt.getTime());
  const elapsedRatio = Math.min(1, Math.max(0, (asOf.getTime() - createdAt.getTime()) / totalMs));
  const expectedAmount = target.times(elapsedRatio);
  return {
    remainingAmount: remaining.toFixed(2), requiredMonthlyContribution: remaining.div(monthsRemaining).toFixed(2), monthsRemaining,
    scheduleStatus: current.isZero() ? 'NOT_STARTED' as const : current.greaterThanOrEqualTo(expectedAmount) ? 'ON_TRACK' as const : 'BEHIND' as const,
  };
}
