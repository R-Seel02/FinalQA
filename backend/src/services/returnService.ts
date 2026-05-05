import { Types } from 'mongoose';
import { Reservation, IReservation } from '../models/Reservation';
import { Bottle } from '../models/Bottle';
import { User } from '../models/User';
import { AuditEntry } from '../models/AuditEntry';
import { refundPayment, chargePayment } from './paymentService';
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError
} from '../utils/errors';
import { daysSince } from '../utils/dateHelpers';
import { env } from '../config/env';

interface ProcessReturnInput {
  reservationId: string;
  conciergeId: string;
  sealIntact: boolean;
  damageNotes?: string;
}

/**
 * Implements US-008 (clean return) and US-009 (broken seal) in a single entry
 * point because they share the inspection step. The sealIntact flag determines
 * which terminal state and which financial path is taken.
 */
export async function processReturn(
  input: ProcessReturnInput
): Promise<IReservation> {
  const reservation = await Reservation.findById(input.reservationId);
  if (!reservation) throw new NotFoundError('reservation not found');

  if (reservation.state !== 'out') {
    throw new ConflictError(
      `only reservations in 'out' state may be returned (current: ${reservation.state})`
    );
  }

  const bottle = await Bottle.findById(reservation.bottleId);
  if (!bottle) throw new NotFoundError('associated bottle not found');

  if (input.sealIntact) {
    // Clean return path (US-008)
    const refund = await refundPayment({
      customerId: reservation.customerId.toString(),
      amountCents: reservation.depositCents,
      reference: `return-${reservation.id}-deposit`
    });

    reservation.state = 'returned';
    reservation.forfeiture = {
      outcome: 'clean',
      inspectorId: new Types.ObjectId(input.conciergeId),
      inspectedAt: new Date(),
      notes: input.damageNotes || 'clean return; seal intact'
    };
    reservation.events.push({
      kind: 'deposit_refund',
      amountCents: reservation.depositCents,
      at: new Date(),
      reference: refund.transactionId || 'mock-refund'
    });
    await reservation.save();

    bottle.state = 'available';
    await bottle.save();
  } else {
    // Broken seal path (US-009)
    if (!input.damageNotes || input.damageNotes.length < 20) {
      throw new ValidationError(
        'damage notes must be at least 20 characters when seal is not intact'
      );
    }

    reservation.state = 'returned';
    reservation.forfeiture = {
      outcome: 'broken_seal',
      inspectorId: new Types.ObjectId(input.conciergeId),
      inspectedAt: new Date(),
      notes: input.damageNotes
    };
    // No deposit refund — deposit is forfeited
    await reservation.save();

    bottle.state = 'damaged';
    await bottle.save();

    await AuditEntry.create({
      actorId: new Types.ObjectId(input.conciergeId),
      actorRole: 'concierge',
      action: 'bottle.broken_seal',
      targetType: 'bottle',
      targetId: bottle._id,
      reason: input.damageNotes,
      metadata: { reservationId: reservation.id }
    });
  }

  return reservation;
}

interface MarkMissingInput {
  bottleId: string;
  conciergeId: string;
  reason: string;
}

/**
 * Marks a bottle missing per US-010. Eligible only if there is an active
 * reservation that is more than `missingThresholdDays` past its scheduled
 * return date.
 */
export async function markBottleMissing(
  input: MarkMissingInput
): Promise<{ bottleId: string; reservationId: string }> {
  if (input.reason.length < 20) {
    throw new ValidationError('reason must be at least 20 characters');
  }

  const bottle = await Bottle.findById(input.bottleId);
  if (!bottle) throw new NotFoundError('bottle not found');

  const activeReservation = await Reservation.findOne({
    bottleId: bottle._id,
    state: 'out'
  });
  if (!activeReservation) {
    throw new UnprocessableError(
      'bottle has no active rental and cannot be marked missing'
    );
  }

  const daysOverdue = daysSince(activeReservation.endDate);
  if (daysOverdue <= env.missingThresholdDays) {
    throw new UnprocessableError(
      `bottle is not yet eligible to be marked missing (${daysOverdue} days overdue, threshold is ${env.missingThresholdDays})`
    );
  }

  // Charge customer the full retail value
  const charge = await chargePayment({
    customerId: activeReservation.customerId.toString(),
    amountCents: bottle.retailValueCents,
    reference: `missing-${bottle.id}`
  });

  if (!charge.success) {
    // Add to outstanding balance for later collection
    await User.updateOne(
      { _id: activeReservation.customerId },
      { $inc: { outstandingBalanceCents: bottle.retailValueCents } }
    );
  }

  activeReservation.state = 'returned';
  activeReservation.forfeiture = {
    outcome: 'missing',
    inspectorId: new Types.ObjectId(input.conciergeId),
    inspectedAt: new Date(),
    notes: input.reason
  };
  activeReservation.events.push({
    kind: 'missing_charge',
    amountCents: bottle.retailValueCents,
    at: new Date(),
    reference: charge.transactionId || 'mock-charge'
  });
  await activeReservation.save();

  bottle.state = 'missing';
  await bottle.save();

  await AuditEntry.create({
    actorId: new Types.ObjectId(input.conciergeId),
    actorRole: 'concierge',
    action: 'bottle.marked_missing',
    targetType: 'bottle',
    targetId: bottle._id,
    reason: input.reason,
    metadata: { reservationId: activeReservation.id, daysOverdue }
  });

  return { bottleId: bottle.id, reservationId: activeReservation.id };
}

/**
 * Daily late-fee accrual job (US-012). In production this would be triggered
 * by a cron scheduler; here it is exposed as a callable function so tests can
 * invoke it deterministically with a mocked clock.
 */
export async function accrueLateFees(now: Date = new Date()): Promise<{
  processed: number;
  totalAccruedCents: number;
}> {
  const overdueReservations = await Reservation.find({
    state: 'out',
    endDate: { $lt: now }
  });

  let totalAccruedCents = 0;
  for (const r of overdueReservations) {
    const cap = r.depositCents;
    if (r.lateFeesAccruedCents >= cap) continue;

    const dailyFee = Math.floor(r.pricePerNightCents * env.lateFeePercent);
    const remaining = cap - r.lateFeesAccruedCents;
    const charge = Math.min(dailyFee, remaining);
    if (charge <= 0) continue;

    r.lateFeesAccruedCents += charge;
    r.events.push({
      kind: 'late_fee',
      amountCents: charge,
      at: now,
      reference: `late-${r.id}-${now.toISOString().slice(0, 10)}`
    });
    await r.save();
    totalAccruedCents += charge;
  }

  return { processed: overdueReservations.length, totalAccruedCents };
}

/**
 * Helper for testing: transition a reservation from `reserved` to `out` to
 * simulate the customer picking up the bottle.
 */
export async function markPickedUp(reservationId: string): Promise<IReservation> {
  const reservation = await Reservation.findById(reservationId);
  if (!reservation) throw new NotFoundError('reservation not found');
  if (reservation.state !== 'reserved') {
    throw new ConflictError(
      `only reservations in 'reserved' state may be picked up (current: ${reservation.state})`
    );
  }
  reservation.state = 'out';
  await reservation.save();

  await Bottle.updateOne(
    { _id: reservation.bottleId, state: 'reserved' },
    { state: 'out' }
  );

  return reservation;
}
