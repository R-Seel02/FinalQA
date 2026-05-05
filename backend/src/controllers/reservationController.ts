import { Response } from 'express';
import {
  createReservation,
  cancelReservation,
  getMyActiveReservations,
  reassignReservation
} from '../services/reservationService';
import { AuthenticatedRequest } from '../types';
import { AuthenticationError, ValidationError } from '../utils/errors';

export async function postReservation(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) throw new AuthenticationError();
  const { bottleId, startDate, endDate } = req.body ?? {};
  if (!bottleId || !startDate || !endDate) {
    throw new ValidationError('bottleId, startDate, and endDate are required');
  }

  const reservation = await createReservation({
    customerId: req.user.id,
    bottleId,
    startDate: new Date(startDate),
    endDate: new Date(endDate)
  });
  res.status(201).json(reservation);
}

export async function deleteReservation(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) throw new AuthenticationError();
  const reservation = await cancelReservation(req.params.id, req.user.id);
  res.status(200).json(reservation);
}

export async function listMyReservations(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) throw new AuthenticationError();
  const items = await getMyActiveReservations(req.user.id);
  res.status(200).json({ items });
}

export async function postReassignment(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) throw new AuthenticationError();
  const { substituteBottleId, reason } = req.body ?? {};
  if (!substituteBottleId || !reason) {
    throw new ValidationError('substituteBottleId and reason are required');
  }
  const result = await reassignReservation({
    reservationId: req.params.id,
    substituteBottleId,
    conciergeId: req.user.id,
    reason
  });
  res.status(200).json(result);
}
