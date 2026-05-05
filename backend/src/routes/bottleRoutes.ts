import { Router } from 'express';
import {
  createBottle,
  retireBottle
} from '../controllers/bottleController';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.post(
  '/',
  authenticate,
  requireRole('concierge'),
  asyncHandler(createBottle)
);
router.post(
  '/:id/retire',
  authenticate,
  requireRole('concierge'),
  asyncHandler(retireBottle)
);

export default router;
