import mongoose, { Schema, Document, Model } from 'mongoose';
import { BottleState } from '../types';

export interface IBottle extends Document {
  labelName: string;
  producer: string;
  vintage: number;
  region: string;
  varietal: string;
  photoUrl: string;
  retailValueCents: number;
  pricePerNightCents: number;
  depositCents: number;
  state: BottleState;
  retiredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CURRENT_YEAR = new Date().getUTCFullYear();

const BottleSchema = new Schema<IBottle>(
  {
    labelName: { type: String, required: true, trim: true, minlength: 1 },
    producer: { type: String, required: true, trim: true },
    vintage: {
      type: Number,
      required: true,
      min: [1900, 'vintage must be 1900 or later'],
      max: [CURRENT_YEAR, `vintage must be ${CURRENT_YEAR} or earlier`],
      validate: {
        validator: Number.isInteger,
        message: 'vintage must be an integer year'
      }
    },
    region: { type: String, required: true, trim: true },
    varietal: { type: String, required: true, trim: true },
    photoUrl: { type: String, required: true, trim: true },
    retailValueCents: {
      type: Number,
      required: true,
      min: [1, 'retail value must be greater than zero']
    },
    pricePerNightCents: {
      type: Number,
      required: true,
      min: [1, 'price per night must be greater than zero']
    },
    depositCents: {
      type: Number,
      required: true,
      min: [1, 'deposit must be greater than zero']
    },
    state: {
      type: String,
      enum: ['available', 'reserved', 'out', 'damaged', 'missing', 'retired'],
      default: 'available',
      required: true,
      index: true
    },
    retiredAt: { type: Date }
  },
  { timestamps: true }
);

// Per Assumption 4 in the Phase 1 backlog: deposit equals retail value.
// Enforced at the schema level so it cannot be bypassed by a buggy controller.
BottleSchema.pre('validate', function (next) {
  if (this.depositCents !== this.retailValueCents) {
    return next(
      new mongoose.Error.ValidatorError({
        path: 'depositCents',
        message: 'deposit must equal retail value'
      })
    );
  }
  next();
});

BottleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.__v;
    return r;
  }
});

export const Bottle: Model<IBottle> = mongoose.model<IBottle>('Bottle', BottleSchema);
