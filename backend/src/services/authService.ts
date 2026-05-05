import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, PASSWORD_PATTERN, IUser } from '../models/User';
import { env } from '../config/env';
import {
  AuthenticationError,
  ConflictError,
  TooManyRequestsError,
  ValidationError
} from '../utils/errors';
import { UserRole } from '../types';

const SALT_ROUNDS = 10;

interface RegisterInput {
  email: string;
  password: string;
  shippingAddress?: string;
  role?: UserRole;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

function buildToken(user: IUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions
  );
}

export async function registerUser(input: RegisterInput): Promise<AuthResponse> {
  if (!PASSWORD_PATTERN.test(input.password)) {
    throw new ValidationError(
      'password must be at least 8 characters and include an uppercase letter, a digit, and a symbol from !@#$%^&*'
    );
  }

  const existing = await User.findOne({ email: input.email.toLowerCase() }).lean();
  if (existing) {
    throw new ConflictError('an account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await User.create({
    email: input.email.toLowerCase(),
    passwordHash,
    role: input.role ?? 'customer',
    shippingAddress: input.shippingAddress ?? ''
  });

  return {
    token: buildToken(user),
    user: { id: user.id, email: user.email, role: user.role }
  };
}

export async function loginUser(input: LoginInput): Promise<AuthResponse> {
  const user = await User.findOne({ email: input.email.toLowerCase() });
  // Generic message — never enumerate which side of the credential is wrong (AC-001.2)
  const genericMessage = 'invalid credentials';

  if (!user) {
    throw new AuthenticationError(genericMessage);
  }

  const now = new Date();

  // Lockout check (AC-002.2)
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new TooManyRequestsError(
      `account is temporarily locked until ${user.lockedUntil.toISOString()}`
    );
  }

  // Prune attempts older than the rolling window
  const windowMs = env.lockoutWindowMinutes * 60 * 1000;
  user.failedLoginAttempts = user.failedLoginAttempts.filter(
    (a) => now.getTime() - a.at.getTime() <= windowMs
  );

  const ok = await user.comparePassword(input.password);

  if (!ok) {
    user.failedLoginAttempts.push({ at: now });
    if (user.failedLoginAttempts.length >= env.lockoutMaxAttempts) {
      user.lockedUntil = new Date(
        now.getTime() + env.lockoutDurationMinutes * 60 * 1000
      );
      user.failedLoginAttempts = [];
      await user.save();
      throw new TooManyRequestsError(
        `too many failed attempts; account locked until ${user.lockedUntil.toISOString()}`
      );
    }
    await user.save();
    throw new AuthenticationError(genericMessage);
  }

  // Successful login — clear failures
  user.failedLoginAttempts = [];
  user.lockedUntil = undefined;
  await user.save();

  return {
    token: buildToken(user),
    user: { id: user.id, email: user.email, role: user.role }
  };
}
