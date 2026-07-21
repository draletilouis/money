export function inclusiveBudgetRange(startDate: Date | string, endDate: Date | string) {
  const start = new Date(startDate); const end = new Date(endDate);
  start.setUTCHours(0, 0, 0, 0); end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function budgetRangesOverlap(firstStart: Date | string, firstEnd: Date | string, secondStart: Date | string, secondEnd: Date | string) {
  const first = inclusiveBudgetRange(firstStart, firstEnd); const second = inclusiveBudgetRange(secondStart, secondEnd);
  return first.start <= second.end && first.end >= second.start;
}
