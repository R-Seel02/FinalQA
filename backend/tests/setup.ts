import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { User } from '../src/models/User';
import { Bottle } from '../src/models/Bottle';
import { Reservation } from '../src/models/Reservation';
import { AuditEntry } from '../src/models/AuditEntry';
import { clearPaymentFailureInjection } from '../src/services/paymentService';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await connectDatabase(process.env.MONGODB_URI as string);
  }
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Bottle.deleteMany({}),
    Reservation.deleteMany({}),
    AuditEntry.deleteMany({})
  ]);
  clearPaymentFailureInjection();
});

afterAll(async () => {
  await disconnectDatabase();
});
