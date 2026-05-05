import { MongoMemoryServer } from 'mongodb-memory-server';

declare global {
  // eslint-disable-next-line no-var
  var __MONGOD__: MongoMemoryServer | undefined;
}

export default async function globalSetup(): Promise<void> {
  // If TEST_MONGODB_URI is set, use it directly (e.g., docker-compose mongo).
  // Otherwise spin up an in-memory instance.
  if (process.env.TEST_MONGODB_URI) {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
  } else {
    const mongod = await MongoMemoryServer.create({
      // Pin a binary version with broad Ubuntu compatibility.
      // Override via MONGOMS_VERSION env var if needed.
      binary: { version: process.env.MONGOMS_VERSION || '7.0.14' }
    });
    process.env.MONGODB_URI = mongod.getUri();
    (global as { __MONGOD__?: MongoMemoryServer }).__MONGOD__ = mongod;
  }
  process.env.JWT_SECRET = 'test-secret-key-for-jest-runs-only';
  process.env.NODE_ENV = 'test';
}
