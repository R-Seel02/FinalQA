import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User';
import { Bottle } from '../src/models/Bottle';
import { env } from '../src/config/env';
import { UserRole } from '../src/types';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  role: UserRole;
}

export async function createTestUser(overrides: {
  email?: string;
  password?: string;
  role?: UserRole;
} = {}): Promise<TestUser> {
  const email = overrides.email || `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const password = overrides.password || 'TestPass1!';
  const role: UserRole = overrides.role || 'customer';
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email,
    passwordHash,
    role
  });
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: '1h' }
  );
  return { id: user.id, email, password, token, role };
}

export async function createTestBottle(overrides: Partial<{
  retailValueCents: number;
  pricePerNightCents: number;
  state: 'available' | 'reserved' | 'out' | 'damaged' | 'missing' | 'retired';
  vintage: number;
}> = {}) {
  const retailValueCents = overrides.retailValueCents ?? 50000_00;
  return Bottle.create({
    labelName: 'Test Wine',
    producer: 'Test Producer',
    vintage: overrides.vintage ?? 2018,
    region: 'Test Region',
    varietal: 'Test Varietal',
    photoUrl: 'https://example.com/test.jpg',
    retailValueCents,
    pricePerNightCents: overrides.pricePerNightCents ?? 100_00,
    depositCents: retailValueCents,
    state: overrides.state ?? 'available'
  });
}

/** Returns a date offset by N days from now, normalized to UTC midnight. */
export function dateOffset(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
