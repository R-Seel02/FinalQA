import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { ReservationState, InspectionOutcome } from '../types';

export interface IFinancialEvent {
  kind:
    | 'rental_charge'
    | 'deposit_hold'
    | 'rental_refund'
    | 'deposit_refund'
    | 'late_fee'
    | 'missing_charge';
  amountCents: number;
  at: Date;
  reference: string;
}

export interface IForfeitureRecord {
  outcome: InspectionOutcome;
  inspectorId: Types.ObjectId;
  inspectedAt: Date;
  notes: string;
}

export interface IReservation extends Document {
  customerId: Types.ObjectId;
  bottleId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  pricePerNightCents: number; // captured at booking, never re-read from bottle
  depositCents: number;
  totalRentalCents: number;
  state: ReservationState;
  events: IFinancialEvent[];
  forfeiture?: IForfeitureRecord;
  reassignedTo?: Types.ObjectId;
  lateFeesAccruedCents: number;
  createdAt: Date;
  updatedAt: Date;
}

const FinancialEventSchema = new Schema<IFinancialEvent>(
  {
    kind: {
      type: String,
      enum: [
        'rental_charge',
        'deposit_hold',
        'rental_refund',
        'deposit_refund',
        'late_fee',
        'missing_charge'
      ],
      required: true
    },
    amountCents: { type: Number, required: true },
    at: { type: Date, required: true, default: () => new Date() },
    reference: { type: String, required: true }
  },
  { _id: false }
);

const ForfeitureSchema = new Schema<IForfeitureRecord>(
  {
    outcome: {
      type: String,
      enum: ['clean', 'broken_seal', 'damaged', 'missing'],
      required: true
    },
    inspectorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    inspectedAt: { type: Date, required: true },
    notes: {
      type: String,
      required: true,
      minlength: [
        20,
        'inspection notes must be at least 20 characters (per AC-009.1)'
      ]
    }
  },
  { _id: false }
);

const ReservationSchema = new Schema<IReservation>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    bottleId: {
      type: Schema.Types.ObjectId,
      ref: 'Bottle',
      required: true,
      index: true
    },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    pricePerNightCents: { type: Number, required: true, min: 1 },
    depositCents: { type: Number, required: true, min: 1 },
    totalRentalCents: { type: Number, required: true, min: 1 },
    state: {
      type: String,
      enum: ['reserved', 'out', 'returned', 'cancelled', 'reassigned'],
      default: 'reserved',
      required: true,
      index: true
    },
    events: [FinancialEventSchema],
    forfeiture: ForfeitureSchema,
    reassignedTo: { type: Schema.Types.ObjectId, ref: 'Reservation' },
    lateFeesAccruedCents: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

// Enforce that endDate is strictly after startDate.
ReservationSchema.pre('validate', function (next) {
  if (this.endDate <= this.startDate) {
    return next(
      new mongoose.Error.ValidatorError({
        path: 'endDate',
        message: 'end date must be after start date'
      })
    );
  }
  next();
});

ReservationSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.__v;
    return r;
  }
});

export const Reservation: Model<IReservation> = mongoose.model<IReservation>(
  'Reservation',
  ReservationSchema
);
