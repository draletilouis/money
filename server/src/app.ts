import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { accountSchema, assetSchema, budgetSchema, categorySchema, loginSchema, profileSchema, setupSchema, transactionSchema } from '../../shared/contracts.js';
import { prisma } from './lib/db.js';
import { AppError, errorHandler, notFound, validate } from './lib/http.js';
import { createToken, requireAuth } from './middleware/auth.js';
import { createFinancialAccount, createProfile, initializeOwner } from './services/profile-service.js';
import { createPostedTransaction, reversePostedTransaction } from './services/transaction-service.js';
import { accountSummaries, assertProfileAccess, dashboard, ledgerBalances } from './services/report-service.js';

const app = express();
const param = (value: string | string[]) => Array.isArray(value) ? value[0] : value;
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

app.get('/api/auth/setup-status', async (_request, response, next) => {
  try { response.json({ required: await prisma.user.count() === 0 }); } catch (error) { next(error); }
});

app.post('/api/auth/setup', rateLimit({ windowMs: 60 * 60_000, limit: 5 }), validate(setupSchema), async (request, response, next) => {
  try {
    const user = await initializeOwner({ name: request.body.name, email: request.body.email, passwordHash: await bcrypt.hash(request.body.password, 12) });
    if (!user) throw new AppError(409, 'Initial setup has already been completed.');
    response.cookie('money_manager_session', createToken(user.id), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60_000 });
    response.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 15 }), validate(loginSchema), async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: request.body.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(request.body.password, user.passwordHash))) throw new AppError(401, 'Email or password is incorrect.');
    response.cookie('money_manager_session', createToken(user.id), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60_000 });
    response.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (_request, response) => { response.clearCookie('money_manager_session'); response.status(204).end(); });

app.use('/api', requireAuth);

app.get('/api/me', async (request, response, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId }, select: { id: true, name: true, email: true, preference: true } });
    response.json(user);
  } catch (error) { next(error); }
});

app.get('/api/profiles', async (request, response, next) => {
  try {
    const profiles = await prisma.profile.findMany({ where: { ownerId: request.userId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    response.json(profiles);
  } catch (error) { next(error); }
});

app.post('/api/profiles', validate(profileSchema), async (request, response, next) => {
  try { response.status(201).json(await createProfile(request.userId!, request.body)); } catch (error) { next(error); }
});

app.put('/api/preferences/profile', async (request, response, next) => {
  try {
    const profileId = typeof request.body.profileId === 'string' ? request.body.profileId : null;
    if (profileId) await assertProfileAccess(request.userId!, profileId);
    const preference = await prisma.profilePreference.upsert({ where: { userId: request.userId }, create: { userId: request.userId!, selectedProfileId: profileId, allProfiles: !profileId }, update: { selectedProfileId: profileId, allProfiles: !profileId } });
    response.json(preference);
  } catch (error) { next(error); }
});

app.get('/api/profiles/:profileId/accounts', async (request, response, next) => {
  try { response.json(await accountSummaries(request.userId!, param(request.params.profileId))); } catch (error) { next(error); }
});

app.post('/api/profiles/:profileId/accounts', validate(accountSchema), async (request, response, next) => {
  try { response.status(201).json(await createFinancialAccount(request.userId!, param(request.params.profileId), request.body)); } catch (error) { next(error); }
});

app.get('/api/profiles/:profileId/categories', async (request, response, next) => {
  try {
    const profileId = param(request.params.profileId);
    await assertProfileAccess(request.userId!, profileId);
    response.json(await prisma.category.findMany({ where: { profileId, active: true }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }));
  } catch (error) { next(error); }
});

app.post('/api/profiles/:profileId/categories', validate(categorySchema), async (request, response, next) => {
  try {
    const profileId = param(request.params.profileId);
    await assertProfileAccess(request.userId!, profileId);
    const ledger = await prisma.ledgerAccount.findFirst({ where: { id: request.body.ledgerAccountId, profileId } });
    if (!ledger) throw new AppError(400, 'Ledger account does not belong to this profile.');
    response.status(201).json(await prisma.category.create({ data: { ...request.body, profileId } }));
  } catch (error) { next(error); }
});

app.get('/api/profiles/:profileId/transactions', async (request, response, next) => {
  try {
    const profileId = param(request.params.profileId);
    await assertProfileAccess(request.userId!, profileId);
    const page = Math.max(Number(request.query.page) || 1, 1); const pageSize = Math.min(Math.max(Number(request.query.pageSize) || 30, 1), 100);
    const where = { profileId, ...(request.query.type ? { type: request.query.type as never } : {}), ...(request.query.search ? { OR: [{ description: { contains: String(request.query.search), mode: 'insensitive' as const } }, { counterparty: { contains: String(request.query.search), mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([
      prisma.transaction.findMany({ where, include: { fromAccount: true, toAccount: true, category: true, attachments: true }, orderBy: { transactionDate: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.transaction.count({ where }),
    ]);
    response.json({ items, total, page, pageSize });
  } catch (error) { next(error); }
});

app.post('/api/profiles/:profileId/transactions', validate(transactionSchema), async (request, response, next) => {
  try { response.status(201).json(await createPostedTransaction(request.userId!, param(request.params.profileId), request.body)); } catch (error) { next(error); }
});

app.post('/api/profiles/:profileId/transactions/:transactionId/reverse', async (request, response, next) => {
  try { response.status(201).json(await reversePostedTransaction(request.userId!, param(request.params.profileId), param(request.params.transactionId))); } catch (error) { next(error); }
});

const uploadDirectory = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const upload = multer({ storage: multer.diskStorage({ destination: uploadDirectory, filename: (_request, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: 10 * 1024 * 1024, files: 5 }, fileFilter: (_request, file, callback) => { if (allowedMimeTypes.has(file.mimetype)) callback(null, true); else callback(new AppError(400, 'Unsupported file type.')); } });

app.post('/api/profiles/:profileId/transactions/:transactionId/attachments', upload.array('files', 5), async (request, response, next) => {
  try {
    const profileId = param(request.params.profileId); const transactionId = param(request.params.transactionId);
    await assertProfileAccess(request.userId!, profileId);
    const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, profileId } });
    if (!transaction) throw new AppError(404, 'Transaction not found.');
    const files = request.files as Express.Multer.File[];
    const records = await Promise.all(files.map((file) => prisma.attachment.create({ data: { profileId, transactionId: transaction.id, fileName: file.originalname, storedName: file.filename, mimeType: file.mimetype, sizeBytes: file.size, storageKey: file.path } })));
    response.status(201).json(records);
  } catch (error) { next(error); }
});

app.get('/api/attachments/:attachmentId', async (request, response, next) => {
  try {
    const attachment = await prisma.attachment.findFirst({ where: { id: param(request.params.attachmentId), profile: { ownerId: request.userId } } });
    if (!attachment) throw new AppError(404, 'Attachment not found.');
    response.type(attachment.mimeType).sendFile(path.resolve(attachment.storageKey));
  } catch (error) { next(error); }
});

app.get('/api/profiles/:profileId/dashboard', async (request, response, next) => {
  try { response.json(await dashboard(request.userId!, param(request.params.profileId))); } catch (error) { next(error); }
});

app.get('/api/dashboard/all', async (request, response, next) => {
  try {
    const profiles = await prisma.profile.findMany({ where: { ownerId: request.userId, status: 'ACTIVE' } });
    const results = await Promise.all(profiles.map((profile) => dashboard(request.userId!, profile.id)));
    response.json({ profiles: results.map((result) => ({ id: result.profile.id, name: result.profile.name, type: result.profile.type, currency: result.profile.baseCurrencyCode, metrics: result.metrics })), metrics: results.reduce((total, result) => ({ available: total.available + Number(result.metrics.available), moneyIn: total.moneyIn + Number(result.metrics.moneyIn), moneyOut: total.moneyOut + Number(result.metrics.moneyOut), netCashFlow: total.netCashFlow + Number(result.metrics.netCashFlow), netWorth: total.netWorth + Number(result.metrics.netWorth) }), { available: 0, moneyIn: 0, moneyOut: 0, netCashFlow: 0, netWorth: 0 }) });
  } catch (error) { next(error); }
});

app.get('/api/profiles/:profileId/assets', async (request, response, next) => {
  try { const profileId = param(request.params.profileId); await assertProfileAccess(request.userId!, profileId); response.json(await prisma.asset.findMany({ where: { profileId, status: 'ACTIVE' }, include: { valuations: { orderBy: { valuedAt: 'desc' }, take: 3 } }, orderBy: { createdAt: 'desc' } })); } catch (error) { next(error); }
});

app.post('/api/profiles/:profileId/assets', validate(assetSchema), async (request, response, next) => {
  try {
    const profileId = param(request.params.profileId); await assertProfileAccess(request.userId!, profileId);
    const asset = await prisma.asset.create({ data: { ...request.body, profileId, valuations: { create: { value: request.body.currentEstimatedValue, valuedAt: request.body.valuationDate, notes: 'Initial valuation' } } }, include: { valuations: true } });
    response.status(201).json(asset);
  } catch (error) { next(error); }
});

app.get('/api/profiles/:profileId/planning', async (request, response, next) => {
  try {
    const profileId = param(request.params.profileId); await assertProfileAccess(request.userId!, profileId);
    const [budgets, bills, expectedIncome, goals] = await Promise.all([
      prisma.budget.findMany({ where: { profileId }, include: { category: true }, orderBy: { startDate: 'desc' } }),
      prisma.bill.findMany({ where: { profileId }, include: { category: true }, orderBy: { dueDate: 'asc' } }),
      prisma.expectedIncome.findMany({ where: { profileId }, include: { category: true }, orderBy: { expectedDate: 'asc' } }),
      prisma.goal.findMany({ where: { profileId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const budgetsWithUsage = await Promise.all(budgets.map(async (budget) => {
      const spent = await prisma.transaction.aggregate({ where: { profileId, categoryId: budget.categoryId, type: 'MONEY_OUT', status: 'POSTED', transactionDate: { gte: budget.startDate, lte: budget.endDate } }, _sum: { baseAmount: true } });
      return { ...budget, spent: spent._sum.baseAmount?.toString() ?? '0' };
    }));
    response.json({ budgets: budgetsWithUsage, bills, expectedIncome, goals });
  } catch (error) { next(error); }
});

app.post('/api/profiles/:profileId/budgets', validate(budgetSchema), async (request, response, next) => {
  try {
    const profileId = param(request.params.profileId); await assertProfileAccess(request.userId!, profileId);
    const category = await prisma.category.findFirst({ where: { id: request.body.categoryId, profileId, type: 'EXPENSE' } });
    if (!category) throw new AppError(400, 'Choose an expense category from this profile.');
    response.status(201).json(await prisma.budget.create({ data: { ...request.body, profileId } }));
  } catch (error) { next(error); }
});

app.get('/api/profiles/:profileId/reports/trial-balance', async (request, response, next) => {
  try { response.json((await ledgerBalances(request.userId!, param(request.params.profileId))).filter((item) => item.balance !== '0.00')); } catch (error) { next(error); }
});

app.get('/api/profiles/:profileId/reports/profit-loss', async (request, response, next) => {
  try {
    const balances = await ledgerBalances(request.userId!, param(request.params.profileId));
    const income = balances.filter((item) => item.accountClass === 'INCOME'); const expenses = balances.filter((item) => item.accountClass === 'EXPENSE');
    response.json({ income, expenses, totalIncome: income.reduce((sum, item) => sum + Number(item.balance), 0), totalExpenses: expenses.reduce((sum, item) => sum + Number(item.balance), 0) });
  } catch (error) { next(error); }
});

const webRoot = path.resolve(process.cwd(), 'dist');
app.use(express.static(webRoot));
app.use((request, response, next) => {
  const indexFile = path.join(webRoot, 'index.html');
  if (request.method === 'GET' && !request.path.startsWith('/api') && fs.existsSync(indexFile)) return response.sendFile(indexFile);
  next();
});

app.use(notFound);
app.use(errorHandler);

export default app;
