import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';

export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const validate = (schema: ZodType): RequestHandler => (request, _response, next) => {
  try {
    request.body = schema.parse(request.body);
    next();
  } catch (error) {
    next(error);
  }
};

export const notFound: RequestHandler = (_request, _response, next) => next(new AppError(404, 'That resource was not found.'));

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;
  if (error instanceof ZodError) {
    response.status(400).json({ message: 'Please check the highlighted information.', issues: error.flatten() });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.status).json({ message: error.message, details: error.details });
    return;
  }
  console.error(error);
  response.status(500).json({ message: 'Something went wrong. Please try again.' });
};
