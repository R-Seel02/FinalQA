import { Router } from 'express';
import {
  postReservation,
  deleteReservation,
  listMyReservations,
  postReassignment
} from '../controllers/reservationController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.post(
  '/',
  authenticate,
  requireRole('customer'),
  asyncHandler(postReservation)
);
router.delete(
  '/:id',
  authenticate,
  requireRole('customer'),
  asyncHandler(deleteReservation)
);
router.get(
  '/me',
  authenticate,
  requireRole('customer'),
  asyncHandler(listMyReservations)
);
router.post(
  '/:id/reassign',
  authenticate,
  requireRole('concierge'),
  asyncHandler(postReassignment)
);

export default router;
