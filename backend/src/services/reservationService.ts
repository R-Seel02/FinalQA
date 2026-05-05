import mongoose, { Types } from 'mongoose';
import { Reservation, IReservation } from '../models/Reservation';
import { Bottle } from '../models/Bottle';
import { User } from '../models/User';
import { AuditEntry } from '../models/AuditEntry';
import {
  chargePayment,
  reverseCharge,
  refundPayment
} from './paymentService';
import { env } from '../config/env';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  PaymentError,
  UnprocessableError,
  ValidationError
} from '../utils/errors';
import {
  dateRangesOverlap,
  isTodayOrPast,
  nightsBetween,
  startOfDayUtc
} from '../utils/dateHelpers';
import { ReservationState } from '../types';

interface CreateReservationInput {
  customerId: string;
  bottleId: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Creates a reservation, performing the full transactional booking sequence:
 *   1. Validate dates and bottle state
 *   2. Check overdue balance on customer
 *   3. Detect overlapping reservations
 *   4. Authorize rental fee
 *   5. Authorize deposit (rolling back rental fee on failure — AC-004.2)
 *   6. Persist reservation in `reserved` state
 *   7. Transition bottle to `reserved`
 */
export async function createReservation(
  input: CreateReservationInput
): Promise<IReservation> {
  const start = startOfDayUtc(input.startDate);
  const end = startOfDayUtc(input.endDate);

  // AC-004.1: start must be no earlier than tomorrow
  if (isTodayOrPast(start)) {
    throw new ValidationError('start date must be no earlier than tomorrow');
  }
  if (end <= start) {
    throw new ValidationError('end date must be after start date');
  }

  const nights = nightsBetween(start, end);
  if (nights < 1) {
    throw new ValidationError('rental period must be at least 1 night');
  }
  if (nights > env.maxRentalNights) {
    throw new ValidationError(
      `rental period must not exceed ${env.maxRentalNights} nights`
    );
  }

  const customer = await User.findById(input.customerId);
  if (!customer) throw new NotFoundError('customer not found');
  if (customer.outstandingBalanceCents > 0) {
    throw new UnprocessableError(
      'cannot create reservation while an outstanding balance exists',
      { outstandingCents: customer.outstandingBalanceCents }
    );
  }

  const bottle = await Bottle.findById(input.bottleId);
  if (!bottle) throw new NotFoundError('bottle not found');

  if (
    bottle.state === 'damaged' ||
    bottle.state === 'missing' ||
    bottle.state === 'retired'
  ) {
    throw new ConflictError('this bottle is no longer available for rental');
  }

  // Conflict detection: any active reservation whose date range overlaps
  const activeReservations = await Reservation.find({
    bottleId: bottle._id,
    state: { $in: ['reserved', 'out'] }
  });

  for (const existing of activeReservations) {
    if (
      dateRangesOverlap(
        existing.startDate,
        existing.endDate,
        start,
        end
      )
    ) {
      throw new ConflictError(
        'requested date range conflicts with an existing reservation'
      );
    }
  }

  const totalRentalCents = bottle.pricePerNightCents * nights;
  const reference = `res-${customer.id}-${bottle.id}-${Date.now()}`;

  // Two-step payment with rollback (AC-004.2)
  const rentalCharge = await chargePayment({
    customerId: customer.id,
    amountCents: totalRentalCents,
    reference: `${reference}-rental`
  });
  if (!rentalCharge.success) {
    throw new PaymentError(rentalCharge.error || 'rental fee charge failed');
  }

  const depositCharge = await chargePayment({
    customerId: customer.id,
    amountCents: bottle.depositCents,
    reference: `${reference}-deposit`
  });
  if (!depositCharge.success) {
    // Rollback the rental fee
    await reverseCharge(rentalCharge.transactionId!);
    throw new PaymentError(depositCharge.error || 'deposit charge failed');
  }

  const reservation = await Reservation.create({
    customerId: customer._id,
    bottleId: bottle._id,
    startDate: start,
    endDate: end,
    pricePerNightCents: bottle.pricePerNightCents,
    depositCents: bottle.depositCents,
    totalRentalCents,
    state: 'reserved',
    events: [
      {
        kind: 'rental_charge',
        amountCents: totalRentalCents,
        at: new Date(),
        reference: rentalCharge.transactionId!
      },
      {
        kind: 'deposit_hold',
        amountCents: bottle.depositCents,
        at: new Date(),
        reference: depositCharge.transactionId!
      }
    ]
  });

  // Bottle transitions to `reserved` if currently `available`
  if (bottle.state === 'available') {
    bottle.state = 'reserved';
    await bottle.save();
  }

  return reservation;
}

/**
 * Cancels a customer's own pending reservation. The customer can only cancel
 * reservations they own and only while in the `reserved` state.
 */
export async function cancelReservation(
  reservationId: string,
  actorId: string
): Promise<IReservation> {
  const reservation = await Reservation.findById(reservationId);
  if (!reservation) throw new NotFoundError('reservation not found');

  if (reservation.customerId.toString() !== actorId) {
    throw new AuthorizationError('you may only cancel your own reservations');
  }

  if (reservation.state !== 'reserved') {
    throw new ConflictError(
      `reservations in state '${reservation.state}' cannot be cancelled`
    );
  }

  // Refund both the rental fee and deposit
  const rentalRefund = await refundPayment({
    customerId: actorId,
    amountCents: reservation.totalRentalCents,
    reference: `cancel-${reservation.id}-rental`
  });
  const depositRefund = await refundPayment({
    customerId: actorId,
    amountCents: reservation.depositCents,
    reference: `cancel-${reservation.id}-deposit`
  });

  reservation.state = 'cancelled';
  reservation.events.push(
    {
      kind: 'rental_refund',
      amountCents: reservation.totalRentalCents,
      at: new Date(),
      reference: rentalRefund.transactionId || 'mock-refund'
    },
    {
      kind: 'deposit_refund',
      amountCents: reservation.depositCents,
      at: new Date(),
      reference: depositRefund.transactionId || 'mock-refund'
    }
  );
  await reservation.save();

  // Release the bottle back to available if no other reservations are active
  const otherActive = await Reservation.exists({
    bottleId: reservation.bottleId,
    state: { $in: ['reserved', 'out'] },
    _id: { $ne: reservation._id }
  });
  if (!otherActive) {
    await Bottle.updateOne(
      { _id: reservation.bottleId, state: 'reserved' },
      { state: 'available' }
    );
  }

  return reservation;
}

/**
 * Returns the active reservations belonging to a single customer.
 * Strict tenant isolation: only the authenticated customer's records.
 */
export async function getMyActiveReservations(customerId: string): Promise<IReservation[]> {
  return Reservation.find({
    customerId: new Types.ObjectId(customerId),
    state: { $in: ['reserved', 'out'] }
  })
    .sort({ startDate: 1 })
    .populate('bottleId', 'labelName producer vintage region photoUrl');
}

/**
 * Concierge override: reassign a reservation to a substitute bottle of equal
 * or greater retail value.
 */
export async function reassignReservation(input: {
  reservationId: string;
  substituteBottleId: string;
  conciergeId: string;
  reason: string;
}): Promise<{ original: IReservation; replacement: IReservation }> {
  if (input.reason.length < 20) {
    throw new ValidationError('reason must be at least 20 characters');
  }
  const original = await Reservation.findById(input.reservationId);
  if (!original) throw new NotFoundError('reservation not found');
  if (original.state !== 'reserved') {
    throw new ConflictError(
      `only reservations in 'reserved' state may be reassigned`
    );
  }

  const originalBottle = await Bottle.findById(original.bottleId);
  const substitute = await Bottle.findById(input.substituteBottleId);
  if (!substitute) throw new NotFoundError('substitute bottle not found');
  if (!originalBottle) throw new NotFoundError('original bottle not found');

  if (substitute.state !== 'available') {
    throw new ConflictError('substitute bottle is not available');
  }
  if (substitute.retailValueCents < originalBottle.retailValueCents) {
    throw new UnprocessableError(
      'substitute must have retail value equal to or greater than the original'
    );
  }

  // Check substitute has no conflicting reservations
  const conflicts = await Reservation.find({
    bottleId: substitute._id,
    state: { $in: ['reserved', 'out'] }
  });
  for (const r of conflicts) {
    if (
      dateRangesOverlap(r.startDate, r.endDate, original.startDate, original.endDate)
    ) {
      throw new ConflictError('substitute bottle has a conflicting reservation');
    }
  }

  const replacement = await Reservation.create({
    customerId: original.customerId,
    bottleId: substitute._id,
    startDate: original.startDate,
    endDate: original.endDate,
    pricePerNightCents: original.pricePerNightCents, // preserve original pricing
    depositCents: substitute.depositCents,
    totalRentalCents: original.totalRentalCents,
    state: 'reserved',
    events: [
      {
        kind: 'rental_charge',
        amountCents: 0,
        at: new Date(),
        reference: `reassign-${original.id}`
      }
    ]
  });

  original.state = 'reassigned';
  original.reassignedTo = replacement._id as Types.ObjectId;
  await original.save();

  // Original bottle returns to available if not held by other reservations
  const otherActive = await Reservation.exists({
    bottleId: originalBottle._id,
    state: { $in: ['reserved', 'out'] },
    _id: { $ne: original._id }
  });
  if (!otherActive && originalBottle.state === 'reserved') {
    originalBottle.state = 'available';
    await originalBottle.save();
  }

  // Substitute moves to reserved
  if (substitute.state === 'available') {
    substitute.state = 'reserved';
    await substitute.save();
  }

  await AuditEntry.create({
    actorId: new Types.ObjectId(input.conciergeId),
    actorRole: 'concierge',
    action: 'reservation.reassigned',
    targetType: 'reservation',
    targetId: original._id,
    reason: input.reason,
    metadata: {
      replacementId: replacement.id,
      substituteBottleId: substitute.id
    }
  });

  return { original, replacement };
}
