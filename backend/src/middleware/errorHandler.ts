import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Central error handler. Maps AppError subclasses, Mongoose validation errors,
 * and unexpected exceptions to consistent HTTP responses. Stack traces never
 * leak to the client (Q12d) and are only logged server-side.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      }
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const [key, value] of Object.entries(err.errors)) {
      fieldErrors[key] = value.message;
    }
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'request body failed validation',
        details: fieldErrors
      }
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: `invalid ${err.path}: ${err.value}`
      }
    });
    return;
  }

  // Unexpected error — log with stack but never expose internals
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'an unexpected error occurred'
    }
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `route not found: ${req.method} ${req.path}`
    }
  });
}
