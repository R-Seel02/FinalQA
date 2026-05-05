/**
 * Domain-specific error classes. The HTTP layer maps these to status codes
 * in the central error handler — controllers and services should throw these
 * rather than returning HTTP-shaped responses.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'invalid credentials') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'forbidden') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class PaymentError extends AppError {
  constructor(message = 'payment failed') {
    super(message, 402, 'PAYMENT_ERROR');
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'UNPROCESSABLE', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'too many requests') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}
