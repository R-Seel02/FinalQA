import { Request, Response } from 'express';
import { Bottle } from '../models/Bottle';
import { NotFoundError } from '../utils/errors';

const PAGE_SIZE = 20;

export async function listCatalog(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const region = req.query.region as string | undefined;
  const search = req.query.search as string | undefined;

  const filter: Record<string, unknown> = {
    state: { $in: ['available', 'reserved'] }
  };
  if (region) filter.region = region;
  if (search) {
    filter.$or = [
      { labelName: { $regex: search, $options: 'i' } },
      { producer: { $regex: search, $options: 'i' } }
    ];
  }

  const [items, total] = await Promise.all([
    Bottle.find(filter)
      .sort({ labelName: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    Bottle.countDocuments(filter)
  ]);

  res.status(200).json({
    items,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE)
    }
  });
}

export async function getBottle(req: Request, res: Response): Promise<void> {
  const bottle = await Bottle.findById(req.params.id);
  if (!bottle) throw new NotFoundError('bottle not found');
  if (
    bottle.state === 'damaged' ||
    bottle.state === 'missing' ||
    bottle.state === 'retired'
  ) {
    throw new NotFoundError('bottle not found');
  }
  res.status(200).json(bottle);
}
