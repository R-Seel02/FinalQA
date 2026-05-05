import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown(): Promise<void> {
  const mongod = (global as { __MONGOD__?: MongoMemoryServer }).__MONGOD__;
  if (mongod) {
    await mongod.stop();
  }
}
