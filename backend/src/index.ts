import { buildApp } from './app';
import { connectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './utils/logger';

async function start(): Promise<void> {
  try {
    await connectDatabase();
    const app = buildApp();
    app.listen(env.port, () => {
      logger.info(`Wine Rental API listening on port ${env.port} (${env.nodeEnv})`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

void start();
