import { Response } from 'express';
import { Bottle } from '../models/Bottle';
import { Reservation } from '../models/Reservation';
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from '../utils/errors';
import { AuthenticatedRequest } from '../types';
import { env } from '../config/env';

export async function createBottle(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const {
    labelName,
    producer,
    vintage,
    region,
    varietal,
    photoUrl,
    retailValueCents,
    pricePerNightCents
  } = req.body ?? {};

  // The schema's pre-validate hook enforces deposit equals retail.
  // We compute deposit here for caller convenience.
  const depositCents = env.depositEqualsRetail
    ? retailValueCents
    : req.body?.depositCents;

  const bottle = await Bottle.create({
    labelName,
    producer,
    vintage,
    region,
    varietal,
    photoUrl,
    retailValueCents,
    pricePerNightCents,
    depositCents,
    state: 'available'
  });
  res.status(201).json(bottle);
}

export async function retireBottle(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const bottle = await Bottle.findById(req.params.id);
  if (!bottle) throw new NotFoundError('bottle not found');

  const blocking = await Reservation.find({
    bottleId: bottle._id,
    state: { $in: ['reserved', 'out'] }
  }).select('_id startDate endDate');

  if (blocking.length > 0) {
    throw new ConflictError('cannot retire a bottle with active reservations', {
      reservations: blocking
    });
  }

  bottle.state = 'retired';
  bottle.retiredAt = new Date();
  await bottle.save();
  res.status(200).json(bottle);
}
