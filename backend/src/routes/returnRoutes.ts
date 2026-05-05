import { Router } from 'express';
import {
  postReturn,
  postMarkMissing,
  postPickup,
  postLateFeeRun
} from '../controllers/returnController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.post(
  '/reservations/:id/return',
  authenticate,
  requireRole('concierge'),
  asyncHandler(postReturn)
);
router.post(
  '/reservations/:id/pickup',
  authenticate,
  requireRole('concierge'),
  asyncHandler(postPickup)
);
router.post(
  '/bottles/:id/mark-missing',
  authenticate,
  requireRole('concierge'),
  asyncHandler(postMarkMissing)
);
router.post(
  '/jobs/late-fees',
  authenticate,
  requireRole('concierge'),
  asyncHandler(postLateFeeRun)
);

export default router;
