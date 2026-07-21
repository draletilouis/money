import 'dotenv/config';
import { Decimal } from 'decimal.js';
import { prisma } from '../server/src/lib/db.js';

async function verify() {
  const [profiles, transactions, journals] = await Promise.all([
    prisma.profile.count(),
    prisma.transaction.count(),
    prisma.journalEntry.findMany({ include: { lines: true, transaction: true } }),
  ]);

  const invalid = journals.filter((journal) => {
    if (journal.lines.length < 2) return true;
    const debits = journal.lines.reduce((sum, line) => sum.plus(line.debit.toString()), new Decimal(0));
    const credits = journal.lines.reduce((sum, line) => sum.plus(line.credit.toString()), new Decimal(0));
    return !debits.equals(credits) || journal.transaction?.profileId !== journal.profileId;
  });

  if (invalid.length) {
    throw new Error(`Ledger verification failed for ${invalid.length} journal entries: ${invalid.map((item) => item.id).join(', ')}`);
  }

  console.log(JSON.stringify({
    profiles,
    transactions,
    journalEntries: journals.length,
    journalLines: journals.reduce((sum, journal) => sum + journal.lines.length, 0),
    unbalancedEntries: invalid.length,
  }, null, 2));
}

verify().finally(() => prisma.$disconnect());
