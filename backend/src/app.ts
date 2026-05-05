import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import catalogRoutes from './routes/catalogRoutes';
import reservationRoutes from './routes/reservationRoutes';
import bottleRoutes from './routes/bottleRoutes';
import returnRoutes from './routes/returnRoutes';

export function buildApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Rate limiter on auth endpoints to back the lockout rule with a coarse
  // network-level guard. Per-account lockout still happens in authService.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/bottles', bottleRoutes);
  app.use('/api', returnRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
