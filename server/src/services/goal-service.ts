import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/db.js';
import { AppError } from '../lib/http.js';
import { goalMovementBalance, goalSchedule } from '../domain/goal.js';
import { signedBalance } from '../domain/ledger.js';
import type { GoalInput, GoalMovementInput } from '../../../shared/contracts.js';

const goalInclude = { linkedAccount: true, movements: { include: { account: true }, orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }] } } satisfies Prisma.GoalInclude;

function summarizeGoal<T extends { targetAmount: Prisma.Decimal; createdAt: Date; targetDate: Date | null; movements: { type: 'OPENING_BALANCE' | 'CONTRIBUTION' | 'WITHDRAWAL'; amount: Prisma.Decimal }[] }>(goal: T, asOf = new Date()) {
  const current = goalMovementBalance(goal.movements);
  return { ...goal, currentAmount: current.toFixed(2), ...goalSchedule(goal.targetAmount.toString(), current, goal.targetDate, goal.createdAt, asOf) };
}

export async function listGoals(userId: string, profileId: string, asOf = new Date()) {
  const goals = await prisma.goal.findMany({ where: { profileId, profile: { ownerId: userId } }, include: goalInclude, orderBy: { createdAt: 'desc' } });
  return goals.map((goal) => summarizeGoal(goal, asOf));
}

export async function createGoal(userId: string, profileId: string, input: GoalInput) {
  return prisma.$transaction(async (database) => {
    const account = await database.financialAccount.findFirst({ where: { id: input.linkedAccountId, profileId, profile: { ownerId: userId }, status: 'ACTIVE' }, include: { ledgerAccount: { include: { journalLines: true } }, goalMovements: true } });
    if (!account) throw new AppError(400, 'Choose an active account from this profile for the goal.');
    if (account.ledgerAccount.accountClass !== 'ASSET') throw new AppError(400, 'Goals can only use asset accounts such as cash, bank, mobile money, savings, or investments.');
    const initial = new Decimal(input.currentAmount);
    if (initial.isPositive()) {
      const ledgerBalance = account.ledgerAccount.journalLines.reduce((balance, line) => balance.plus(signedBalance(account.ledgerAccount.accountClass, line.debit.toString(), line.credit.toString())), new Decimal(0));
      const allocated = goalMovementBalance(account.goalMovements); const unallocated = Decimal.max(0, ledgerBalance.minus(allocated));
      if (initial.greaterThan(unallocated)) throw new AppError(409, `${account.name} has only ${unallocated.toFixed(2)} unallocated for goals.`);
    }
    const goal = await database.goal.create({ data: { ...input, profileId, currentAmount: initial.toFixed(4), status: initial.greaterThanOrEqualTo(input.targetAmount) ? 'COMPLETED' : 'ACTIVE' } });
    if (initial.isPositive()) await database.goalMovement.create({ data: { goalId: goal.id, accountId: account.id, type: 'OPENING_BALANCE', amount: initial.toFixed(4), movementDate: new Date(), notes: 'Amount already saved when the goal was created' } });
    await database.auditEvent.create({ data: { userId, profileId, action: 'CREATED', recordType: 'GOAL', recordId: goal.id, newValues: { name: goal.name, targetAmount: goal.targetAmount.toString(), currentAmount: initial.toString() } } });
    return summarizeGoal(await database.goal.findUniqueOrThrow({ where: { id: goal.id }, include: goalInclude }));
  });
}

export async function getGoal(userId: string, profileId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, profileId, profile: { ownerId: userId } }, include: goalInclude });
  if (!goal) throw new AppError(404, 'Goal not found.');
  return summarizeGoal(goal);
}

export async function addGoalMovement(userId: string, profileId: string, goalId: string, input: GoalMovementInput) {
  return prisma.$transaction(async (database) => {
    const goal = await database.goal.findFirst({ where: { id: goalId, profileId, profile: { ownerId: userId } }, include: { movements: true } });
    if (!goal) throw new AppError(404, 'Goal not found.');
    const account = await database.financialAccount.findFirst({ where: { id: input.accountId, profileId, status: 'ACTIVE' }, include: { ledgerAccount: { include: { journalLines: true } }, goalMovements: true } });
    if (!account) throw new AppError(400, 'Choose an active account from this profile.');
    if (account.ledgerAccount.accountClass !== 'ASSET') throw new AppError(400, 'Goals can only use asset accounts.');
    const current = goalMovementBalance(goal.movements); const amount = new Decimal(input.amount);
    if (input.type === 'WITHDRAWAL' && amount.greaterThan(current)) throw new AppError(409, 'You cannot withdraw more than the amount currently allocated to this goal.');
    const accountGoalBalance = goalMovementBalance(goal.movements.filter((movement) => movement.accountId === account.id));
    if (input.type === 'WITHDRAWAL' && amount.greaterThan(accountGoalBalance)) throw new AppError(409, `Only ${accountGoalBalance.toFixed(2)} is allocated to this goal from ${account.name}.`);
    if (input.type === 'CONTRIBUTION') {
      const ledgerBalance = account.ledgerAccount.journalLines.reduce((balance, line) => balance.plus(signedBalance(account.ledgerAccount.accountClass, line.debit.toString(), line.credit.toString())), new Decimal(0));
      const allocated = goalMovementBalance(account.goalMovements);
      const unallocated = Decimal.max(0, ledgerBalance.minus(allocated));
      if (amount.greaterThan(unallocated)) throw new AppError(409, `${account.name} has only ${unallocated.toFixed(2)} unallocated for goals.`);
    }
    const movement = await database.goalMovement.create({ data: { ...input, goalId: goal.id, accountId: account.id, amount: amount.toFixed(4) } });
    const next = input.type === 'WITHDRAWAL' ? current.minus(amount) : current.plus(amount);
    await database.goal.update({ where: { id: goal.id }, data: { currentAmount: next.toFixed(4), linkedAccountId: goal.linkedAccountId ?? account.id, status: next.greaterThanOrEqualTo(goal.targetAmount) ? 'COMPLETED' : 'ACTIVE' } });
    await database.auditEvent.create({ data: { userId, profileId, action: input.type, recordType: 'GOAL_MOVEMENT', recordId: movement.id, newValues: { goalId: goal.id, amount: amount.toString(), accountId: account.id } } });
    return summarizeGoal(await database.goal.findUniqueOrThrow({ where: { id: goal.id }, include: goalInclude }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
