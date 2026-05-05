import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  mongodbUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  depositEqualsRetail: boolean;
  maxRentalNights: number;
  lateFeePercent: number;
  missingThresholdDays: number;
  lockoutMaxAttempts: number;
  lockoutWindowMinutes: number;
  lockoutDurationMinutes: number;
  frontendUrl: string;
}

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env: EnvConfig = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: (process.env.NODE_ENV as EnvConfig['nodeEnv']) || 'development',
  mongodbUri: required('MONGODB_URI', 'mongodb://localhost:27017/wine-rental'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret-change-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  depositEqualsRetail: process.env.DEPOSIT_EQUALS_RETAIL !== 'false',
  maxRentalNights: parseInt(process.env.MAX_RENTAL_NIGHTS || '30', 10),
  lateFeePercent: parseFloat(process.env.LATE_FEE_PERCENT || '0.25'),
  missingThresholdDays: parseInt(process.env.MISSING_THRESHOLD_DAYS || '30', 10),
  lockoutMaxAttempts: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10),
  lockoutWindowMinutes: parseInt(process.env.LOCKOUT_WINDOW_MINUTES || '10', 10),
  lockoutDurationMinutes: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
};
