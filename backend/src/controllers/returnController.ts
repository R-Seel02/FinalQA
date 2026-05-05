import { Response } from 'express';
import {
  processReturn,
  markBottleMissing,
  markPickedUp,
  accrueLateFees
} from '../services/returnService';
import { AuthenticatedRequest } from '../types';
import { AuthenticationError, ValidationError } from '../utils/errors';

export async function postReturn(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) throw new AuthenticationError();
  const { sealIntact, damageNotes } = req.body ?? {};
  if (typeof sealIntact !== 'boolean') {
    throw new ValidationError('sealIntact (boolean) is required');
  }
  const reservation = await processReturn({
    reservationId: req.params.id,
    conciergeId: req.user.id,
    sealIntact,
    damageNotes
  });
  res.status(200).json(reservation);
}

export async function postMarkMissing(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) throw new AuthenticationError();
  const { reason } = req.body ?? {};
  if (!reason) throw new ValidationError('reason is required');
  const result = await markBottleMissing({
    bottleId: req.params.id,
    conciergeId: req.user.id,
    reason
  });
  res.status(200).json(result);
}

export async function postPickup(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) throw new AuthenticationError();
  const reservation = await markPickedUp(req.params.id);
  res.status(200).json(reservation);
}

export async function postLateFeeRun(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const result = await accrueLateFees();
  res.status(200).json(result);
}
