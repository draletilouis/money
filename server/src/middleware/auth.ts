import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../lib/http.js';

type TokenPayload = { sub: string };

const secret = () => process.env.JWT_SECRET ?? 'development-only-secret-change-me';

export const createToken = (userId: string) => jwt.sign({}, secret(), { subject: userId, expiresIn: '7d' });

export const requireAuth: RequestHandler = (request, _response, next) => {
  const token = request.cookies?.money_manager_session as string | undefined;
  if (!token) return next(new AppError(401, 'Please sign in to continue.'));
  try {
    const payload = jwt.verify(token, secret()) as TokenPayload;
    request.userId = payload.sub;
    next();
  } catch {
    next(new AppError(401, 'Your session has expired. Please sign in again.'));
  }
};

