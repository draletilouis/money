import { PrismaClient } from '@prisma/client';

declare global {
  var __moneyManagerPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__moneyManagerPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__moneyManagerPrisma = prisma;
}
