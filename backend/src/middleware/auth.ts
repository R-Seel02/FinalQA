import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
  UserRole
} from '../types';
import { AuthenticationError, AuthorizationError } from '../utils/errors';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AuthenticationError('missing or invalid authorization header'));
  }
  const token = header.substring('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    const user: AuthenticatedUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    };
    req.user = user;
    next();
  } catch {
    next(new AuthenticationError('invalid or expired token'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      return next(new AuthenticationError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError('insufficient role'));
    }
    next();
  };
}
