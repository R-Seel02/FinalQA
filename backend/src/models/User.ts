import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types';

/**
 * Password complexity rule per AC-001.1:
 *   - at least 8 characters
 *   - at least one digit
 *   - at least one uppercase letter
 *   - at least one symbol from !@#$%^&*
 */
export const PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: UserRole;
  shippingAddress?: string;
  failedLoginAttempts: { at: Date }[];
  lockedUntil?: Date;
  outstandingBalanceCents: number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_PATTERN, 'invalid email format']
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['customer', 'concierge'],
      default: 'customer',
      required: true
    },
    shippingAddress: { type: String, default: '' },
    failedLoginAttempts: [
      {
        at: { type: Date, required: true },
        _id: false
      }
    ],
    lockedUntil: { type: Date },
    outstandingBalanceCents: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.passwordHash;
    delete r.failedLoginAttempts;
    delete r.__v;
    return r;
  }
});

export const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);
