import { Router } from 'express';
import { listCatalog, getBottle } from '../controllers/catalogController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.get('/', asyncHandler(listCatalog));
router.get('/:id', asyncHandler(getBottle));

export default router;
