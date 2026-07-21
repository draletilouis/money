import 'dotenv/config';
import app from './app.js';
import { prisma } from './lib/db.js';

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => console.log(`Money Manager API listening on http://localhost:${port}`));

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
