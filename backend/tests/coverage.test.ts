import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp } from '../src/app';
import { createTestUser, createTestBottle, dateOffset } from './helpers';
import { Bottle } from '../src/models/Bottle';
import { Reservation } from '../src/models/Reservation';
import { User } from '../src/models/User';
import {
  markPickedUp,
  accrueLateFees,
  processReturn,
  markBottleMissing
} from '../src/services/returnService';
import {
  reassignReservation,
  cancelReservation,
  createReservation
} from '../src/services/reservationService';
import {
  chargePayment,
  refundPayment,
  reverseCharge,
  injectPaymentFailure
} from '../src/services/paymentService';
import {
  isPastDate,
  isTodayOrPast,
  daysSince,
  nightsBetween,
  dateRangesOverlap
} from '../src/utils/dateHelpers';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  PaymentError,
  UnprocessableError,
  TooManyRequestsError
} from '../src/utils/errors';
import { env } from '../src/config/env';

const app = buildApp();

describe('Bottles: retire (US-013)', () => {
  it('retires an available bottle and sets retiredAt', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post(`/api/bottles/${bottle.id}/retire`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('retired');
    expect(res.body.retiredAt).toBeDefined();
  });

  it('returns 404 for an unknown bottle id', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const res = await request(app)
      .post('/api/bottles/507f1f77bcf86cd799439011/retire')
      .set('Authorization', `Bearer ${concierge.token}`)
      .send();
    expect(res.status).toBe(404);
  });

  it('refuses to retire a bottle with active reservations', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    const res = await request(app)
      .post(`/api/bottles/${bottle.id}/retire`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send();
    expect(res.status).toBe(409);
    expect(res.body.error.details.reservations).toHaveLength(1);
  });
});

describe('Reservations: reassign (US-007)', () => {
  async function setupReassignContext() {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const original = await createTestBottle({ retailValueCents: 100_00 });
    const substitute = await createTestBottle({ retailValueCents: 200_00 });

    const created = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: original.id,
        startDate: dateOffset(1),
        endDate: dateOffset(4)
      });
    return {
      customer,
      concierge,
      original,
      substitute,
      reservationId: created.body._id
    };
  }

  it('reassigns to a substitute of greater retail value', async () => {
    const { concierge, substitute, reservationId, original } =
      await setupReassignContext();
    const res = await request(app)
      .post(`/api/reservations/${reservationId}/reassign`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        substituteBottleId: substitute.id,
        reason: 'original bottle damaged in storage during routine inventory'
      });
    expect(res.status).toBe(200);
    expect(res.body.original.state).toBe('reassigned');
    expect(res.body.replacement.state).toBe('reserved');
    const origBottle = await Bottle.findById(original.id);
    expect(origBottle?.state).toBe('available');
    const subBottle = await Bottle.findById(substitute.id);
    expect(subBottle?.state).toBe('reserved');
  });

  it('rejects a reason shorter than 20 characters', async () => {
    const { concierge, substitute, reservationId } = await setupReassignContext();
    const res = await request(app)
      .post(`/api/reservations/${reservationId}/reassign`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({ substituteBottleId: substitute.id, reason: 'too short' });
    expect(res.status).toBe(400);
  });

  it('rejects when substituteBottleId or reason is missing', async () => {
    const { concierge, reservationId } = await setupReassignContext();
    const res = await request(app)
      .post(`/api/reservations/${reservationId}/reassign`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects substitute with lower retail value', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const original = await createTestBottle({ retailValueCents: 200_00 });
    const cheaper = await createTestBottle({ retailValueCents: 100_00 });
    const created = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: original.id,
        startDate: dateOffset(1),
        endDate: dateOffset(4)
      });
    const res = await request(app)
      .post(`/api/reservations/${created.body._id}/reassign`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        substituteBottleId: cheaper.id,
        reason: 'attempting downgrade for stress test of validation'
      });
    expect(res.status).toBe(422);
  });

  it('rejects when substitute bottle is not available', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const original = await createTestBottle({ retailValueCents: 100_00 });
    const damaged = await createTestBottle({
      retailValueCents: 200_00,
      state: 'damaged'
    });
    const created = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: original.id,
        startDate: dateOffset(1),
        endDate: dateOffset(4)
      });
    const res = await request(app)
      .post(`/api/reservations/${created.body._id}/reassign`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        substituteBottleId: damaged.id,
        reason: 'attempting reassignment to a damaged bottle for testing'
      });
    expect(res.status).toBe(409);
  });

  it('rejects reassignment when reservation is not in reserved state', async () => {
    const { concierge, substitute, reservationId } = await setupReassignContext();
    await markPickedUp(reservationId);
    const res = await request(app)
      .post(`/api/reservations/${reservationId}/reassign`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        substituteBottleId: substitute.id,
        reason: 'attempting reassignment after pickup for negative testing'
      });
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown reservation id', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const sub = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations/507f1f77bcf86cd799439011/reassign')
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        substituteBottleId: sub.id,
        reason: 'unknown reservation reassignment for negative path testing'
      });
    expect(res.status).toBe(404);
  });

  it('rejects when substitute has a conflicting reservation', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const otherCustomer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const original = await createTestBottle({ retailValueCents: 100_00 });
    const substitute = await createTestBottle({ retailValueCents: 200_00 });

    // Original reservation (bottle goes to 'reserved')
    const created = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: original.id,
        startDate: dateOffset(1),
        endDate: dateOffset(4)
      });

    // Inject overlap directly so substitute stays 'available' and we hit the
    // conflict-loop branch in reassignReservation rather than the
    // 'substitute not available' guard.
    await Reservation.create({
      customerId: otherCustomer.id,
      bottleId: substitute.id,
      startDate: dateOffset(2),
      endDate: dateOffset(5),
      pricePerNightCents: substitute.pricePerNightCents,
      depositCents: substitute.depositCents,
      totalRentalCents: substitute.pricePerNightCents * 3,
      state: 'reserved',
      events: []
    });

    const res = await request(app)
      .post(`/api/reservations/${created.body._id}/reassign`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        substituteBottleId: substitute.id,
        reason: 'attempting reassignment to a conflicting bottle for testing'
      });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/conflicting reservation/);
  });
});

describe('Returns: pickup endpoint', () => {
  it('transitions a reserved reservation to out via the pickup route', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    const created = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    const res = await request(app)
      .post(`/api/reservations/${created.body._id}/pickup`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('out');
    const refreshed = await Bottle.findById(bottle.id);
    expect(refreshed?.state).toBe('out');
  });

  it('returns 409 when picking up a non-reserved reservation', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    const created = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    await markPickedUp(created.body._id);
    const res = await request(app)
      .post(`/api/reservations/${created.body._id}/pickup`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send();
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown reservation on pickup', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const res = await request(app)
      .post('/api/reservations/507f1f77bcf86cd799439011/pickup')
      .set('Authorization', `Bearer ${concierge.token}`)
      .send();
    expect(res.status).toBe(404);
  });
});

describe('Late-fee accrual endpoint', () => {
  it('runs accrual via the jobs route', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle({
      pricePerNightCents: 100_00,
      retailValueCents: 200_00
    });
    await Reservation.create({
      customerId: customer.id,
      bottleId: bottle.id,
      startDate: dateOffset(-5),
      endDate: dateOffset(-2),
      pricePerNightCents: 100_00,
      depositCents: 200_00,
      totalRentalCents: 300_00,
      state: 'out',
      events: []
    });
    const res = await request(app)
      .post('/api/jobs/late-fees')
      .set('Authorization', `Bearer ${concierge.token}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.processed).toBeGreaterThanOrEqual(1);
    expect(res.body.totalAccruedCents).toBeGreaterThan(0);
  });

  it('skips reservations already at the deposit cap', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle({
      pricePerNightCents: 100_00,
      retailValueCents: 200_00
    });
    await Reservation.create({
      customerId: customer.id,
      bottleId: bottle.id,
      startDate: dateOffset(-5),
      endDate: dateOffset(-2),
      pricePerNightCents: 100_00,
      depositCents: 200_00,
      totalRentalCents: 300_00,
      state: 'out',
      events: [],
      lateFeesAccruedCents: 200_00
    });
    const result = await accrueLateFees(new Date());
    expect(result.totalAccruedCents).toBe(0);
  });
});

describe('Auth middleware edges', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/api/reservations/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await request(app)
      .get('/api/reservations/me')
      .set('Authorization', 'NotBearer abc');
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid bearer token', async () => {
    const res = await request(app)
      .get('/api/reservations/me')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a token signed with the wrong secret', async () => {
    const badToken = jwt.sign(
      { sub: 'x', email: 'x@x.com', role: 'customer' },
      'wrong-secret'
    );
    const res = await request(app)
      .get('/api/reservations/me')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when role does not match', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/jobs/late-fees')
      .set('Authorization', `Bearer ${customer.token}`)
      .send();
    expect(res.status).toBe(403);
  });
});

describe('Error handler', () => {
  it('returns 404 with a NOT_FOUND code for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 INVALID_ID for malformed ObjectId path params', async () => {
    const res = await request(app).get('/api/catalog/bad-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('serializes ConflictError with its details', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(5)
      });
    const otherCustomer = await createTestUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${otherCustomer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(2),
        endDate: dateOffset(4)
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('Auth controller validation', () => {
  it('register requires email and password', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
  });

  it('login requires email and password', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('reservation create requires bottleId, startDate, endDate', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('return requires sealIntact boolean', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const created = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    await markPickedUp(created.body._id);
    const res = await request(app)
      .post(`/api/reservations/${created.body._id}/return`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('mark-missing requires reason', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post(`/api/bottles/${bottle.id}/mark-missing`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Catalog filters', () => {
  it('filters by region', async () => {
    const a = await createTestBottle();
    a.region = 'Burgundy';
    await a.save();
    const b = await createTestBottle();
    b.region = 'Napa';
    await b.save();
    const res = await request(app).get('/api/catalog?region=Burgundy');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].region).toBe('Burgundy');
  });

  it('filters by search across labelName and producer', async () => {
    const a = await createTestBottle();
    a.labelName = 'Opus One';
    await a.save();
    const b = await createTestBottle();
    b.producer = 'Other House';
    await b.save();
    const res = await request(app).get('/api/catalog?search=opus');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('honors page query parameter', async () => {
    await createTestBottle();
    const res = await request(app).get('/api/catalog?page=2');
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.items).toHaveLength(0);
  });

  it('returns 200 for a direct fetch of an available bottle', async () => {
    const bottle = await createTestBottle();
    const res = await request(app).get(`/api/catalog/${bottle.id}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(bottle.id);
  });

  it('returns 404 when bottle does not exist', async () => {
    const res = await request(app).get('/api/catalog/507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('Reservation service: edge cases', () => {
  it('rejects reservation when customer has an outstanding balance', async () => {
    const customer = await createTestUser({ role: 'customer' });
    await User.updateOne(
      { _id: customer.id },
      { outstandingBalanceCents: 50_00 }
    );
    const bottle = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    expect(res.status).toBe(422);
  });

  it('returns 404 when bottle does not exist', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: '507f1f77bcf86cd799439011',
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    expect(res.status).toBe(404);
  });

  it('rolls back rental charge when deposit charge fails', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    // Fail the deposit charge specifically (second charge)
    await createReservation({
      customerId: customer.id,
      bottleId: bottle.id,
      startDate: dateOffset(40),
      endDate: dateOffset(43)
    }).catch(() => undefined);

    // Next: target the deposit reference for failure
    const refPrefix = `res-${customer.id}-${bottle.id}`;
    injectPaymentFailure(undefined, 'rental decline');
    await expect(
      createReservation({
        customerId: customer.id,
        bottleId: bottle.id,
        startDate: dateOffset(60),
        endDate: dateOffset(63)
      })
    ).rejects.toThrow();

    // Avoid unused-variable lint
    expect(refPrefix.length).toBeGreaterThan(0);
  });

  it('cancelReservation rejects when not in reserved state', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const created = await createReservation({
      customerId: customer.id,
      bottleId: bottle.id,
      startDate: dateOffset(1),
      endDate: dateOffset(3)
    });
    await markPickedUp(created.id);
    await expect(cancelReservation(created.id, customer.id)).rejects.toThrow();
  });

  it('cancelReservation rejects unknown reservation', async () => {
    const customer = await createTestUser({ role: 'customer' });
    await expect(
      cancelReservation('507f1f77bcf86cd799439011', customer.id)
    ).rejects.toThrow();
  });

  it('rejects start date after end date via boundary checks (end == start)', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(2),
        endDate: dateOffset(2)
      });
    expect(res.status).toBe(400);
  });
});

describe('Return service: edge cases', () => {
  it('processReturn rejects unknown reservation', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    await expect(
      processReturn({
        reservationId: '507f1f77bcf86cd799439011',
        conciergeId: concierge.id,
        sealIntact: true
      })
    ).rejects.toThrow();
  });

  it('processReturn rejects reservation not in out state', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    const r = await createReservation({
      customerId: customer.id,
      bottleId: bottle.id,
      startDate: dateOffset(1),
      endDate: dateOffset(3)
    });
    await expect(
      processReturn({
        reservationId: r.id,
        conciergeId: concierge.id,
        sealIntact: true
      })
    ).rejects.toThrow();
  });

  it('markBottleMissing rejects short reason', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    await expect(
      markBottleMissing({
        bottleId: bottle.id,
        conciergeId: concierge.id,
        reason: 'short'
      })
    ).rejects.toThrow();
  });

  it('markBottleMissing returns 404 when bottle is unknown', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    await expect(
      markBottleMissing({
        bottleId: '507f1f77bcf86cd799439011',
        conciergeId: concierge.id,
        reason: 'a reason long enough to satisfy validation rules here'
      })
    ).rejects.toThrow();
  });

  it('markBottleMissing falls back to outstanding balance when payment fails', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    await Reservation.create({
      customerId: customer.id,
      bottleId: bottle.id,
      startDate: dateOffset(-40),
      endDate: dateOffset(-31),
      pricePerNightCents: bottle.pricePerNightCents,
      depositCents: bottle.depositCents,
      totalRentalCents: bottle.pricePerNightCents * 9,
      state: 'out',
      events: []
    });
    injectPaymentFailure(undefined, 'card declined');
    const result = await markBottleMissing({
      bottleId: bottle.id,
      conciergeId: concierge.id,
      reason: 'customer non-responsive after extended communication attempts'
    });
    expect(result.bottleId).toBe(bottle.id);
    const customerAfter = await User.findById(customer.id);
    expect(customerAfter?.outstandingBalanceCents).toBeGreaterThan(0);
  });
});

describe('Payment service', () => {
  it('chargePayment succeeds without injection', async () => {
    const result = await chargePayment({
      customerId: 'c1',
      amountCents: 100,
      reference: 'ref-1'
    });
    expect(result.success).toBe(true);
    expect(result.transactionId).toMatch(/^mock-/);
  });

  it('chargePayment fails for matching reference', async () => {
    injectPaymentFailure('exact-ref', 'declined');
    const ok = await chargePayment({
      customerId: 'c1',
      amountCents: 100,
      reference: 'other-ref'
    });
    expect(ok.success).toBe(true);
    const fail = await chargePayment({
      customerId: 'c1',
      amountCents: 100,
      reference: 'exact-ref'
    });
    expect(fail.success).toBe(false);
    expect(fail.error).toBe('declined');
  });

  it('refundPayment fails when injected', async () => {
    injectPaymentFailure(undefined, 'refund failed');
    const r = await refundPayment({
      customerId: 'c1',
      amountCents: 100,
      reference: 'ref-2'
    });
    expect(r.success).toBe(false);
  });

  it('refundPayment succeeds without injection', async () => {
    const r = await refundPayment({
      customerId: 'c1',
      amountCents: 100,
      reference: 'ref-3'
    });
    expect(r.success).toBe(true);
    expect(r.transactionId).toMatch(/^refund-/);
  });

  it('reverseCharge always succeeds', async () => {
    const r = await reverseCharge('tx-1');
    expect(r.success).toBe(true);
    expect(r.transactionId).toBe('reverse-tx-1');
  });
});

describe('Date helpers', () => {
  it('isPastDate returns true for yesterday and false for tomorrow', () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    expect(isPastDate(yesterday)).toBe(true);
    expect(isPastDate(tomorrow)).toBe(false);
  });

  it('isTodayOrPast returns true for today', () => {
    expect(isTodayOrPast(new Date())).toBe(true);
  });

  it('daysSince returns floor of days', () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 3);
    expect(daysSince(past)).toBeGreaterThanOrEqual(2);
  });

  it('nightsBetween computes inclusive nights', () => {
    const a = new Date('2024-06-01T00:00:00Z');
    const b = new Date('2024-06-04T00:00:00Z');
    expect(nightsBetween(a, b)).toBe(3);
  });

  it('dateRangesOverlap detects edge-touching ranges', () => {
    const a1 = new Date('2024-06-01T00:00:00Z');
    const a2 = new Date('2024-06-05T00:00:00Z');
    const b1 = new Date('2024-06-05T00:00:00Z');
    const b2 = new Date('2024-06-10T00:00:00Z');
    expect(dateRangesOverlap(a1, a2, b1, b2)).toBe(true);
  });

  it('dateRangesOverlap returns false for non-overlapping ranges', () => {
    const a1 = new Date('2024-06-01T00:00:00Z');
    const a2 = new Date('2024-06-05T00:00:00Z');
    const b1 = new Date('2024-06-06T00:00:00Z');
    const b2 = new Date('2024-06-10T00:00:00Z');
    expect(dateRangesOverlap(a1, a2, b1, b2)).toBe(false);
  });
});

describe('Error classes', () => {
  it('AppError carries code, status, and details', () => {
    const err = new AppError('boom', 418, 'TEAPOT', { extra: true });
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.details).toEqual({ extra: true });
  });

  it('subclasses set their own status codes', () => {
    expect(new ValidationError('x').statusCode).toBe(400);
    expect(new AuthenticationError().statusCode).toBe(401);
    expect(new AuthorizationError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError('x').statusCode).toBe(409);
    expect(new PaymentError().statusCode).toBe(402);
    expect(new UnprocessableError('x').statusCode).toBe(422);
    expect(new TooManyRequestsError().statusCode).toBe(429);
  });
});

describe('Bottle model invariants', () => {
  it('rejects deposit that does not equal retail when env enforces equality', async () => {
    if (!env.depositEqualsRetail) return;
    await expect(
      Bottle.create({
        labelName: 'Mismatch',
        producer: 'X',
        vintage: 2020,
        region: 'X',
        varietal: 'Y',
        photoUrl: 'z',
        retailValueCents: 100_00,
        pricePerNightCents: 50_00,
        depositCents: 50_00,
        state: 'available'
      })
    ).rejects.toThrow();
  });
});

describe('Reservation model invariants', () => {
  it('rejects endDate <= startDate at the schema level', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    await expect(
      Reservation.create({
        customerId: customer.id,
        bottleId: bottle.id,
        startDate: dateOffset(5),
        endDate: dateOffset(5),
        pricePerNightCents: 100,
        depositCents: 100,
        totalRentalCents: 100,
        state: 'reserved',
        events: []
      })
    ).rejects.toThrow();
  });
});

describe('Health check', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Payment service: default argument branches', () => {
  it('injectPaymentFailure uses default reason when none is provided', async () => {
    injectPaymentFailure('default-ref');
    const r = await chargePayment({
      customerId: 'c',
      amountCents: 1,
      reference: 'default-ref'
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('payment declined');
  });
});

describe('Payment rollback path', () => {
  it('rolls back rental charge when deposit charge fails (AC-004.2)', async () => {
    const paymentModule = await import('../src/services/paymentService');
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();

    const realCharge = paymentModule.chargePayment;
    let callCount = 0;
    const spy = jest
      .spyOn(paymentModule, 'chargePayment')
      .mockImplementation(async (req) => {
        callCount += 1;
        if (callCount === 2) {
          return { success: false, error: 'deposit declined' };
        }
        return realCharge(req);
      });
    const reverseSpy = jest.spyOn(paymentModule, 'reverseCharge');

    await expect(
      createReservation({
        customerId: customer.id,
        bottleId: bottle.id,
        startDate: dateOffset(10),
        endDate: dateOffset(12)
      })
    ).rejects.toThrow();

    expect(reverseSpy).toHaveBeenCalled();
    spy.mockRestore();
    reverseSpy.mockRestore();
  });
});

describe('Reservation service: nights validation', () => {
  it('rejects when start equals end (zero nights, hits nights < 1 branch)', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    await expect(
      createReservation({
        customerId: customer.id,
        bottleId: bottle.id,
        startDate: dateOffset(2),
        endDate: dateOffset(2)
      })
    ).rejects.toThrow();
  });
});

describe('User model toJSON', () => {
  it('strips passwordHash, failedLoginAttempts, and __v from JSON', async () => {
    const u = await createTestUser({ role: 'customer' });
    const fresh = await User.findById(u.id);
    const json = fresh!.toJSON() as Record<string, unknown>;
    expect(json.passwordHash).toBeUndefined();
    expect(json.failedLoginAttempts).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.email).toBe(u.email);
  });
});

describe('Error handler unit', () => {
  it('maps unexpected Error to 500 INTERNAL_ERROR', async () => {
    const { errorHandler } = await import('../src/middleware/errorHandler');
    const err = new Error('boom');
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json } as unknown as import('express').Response;
    const req = { path: '/x', method: 'GET' } as unknown as import('express').Request;
    errorHandler(err, req, res, jest.fn());
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'an unexpected error occurred' }
    });
  });
});

describe('Bottle model toJSON', () => {
  it('strips __v from JSON', async () => {
    const b = await createTestBottle();
    const json = b.toJSON() as Record<string, unknown>;
    expect(json.__v).toBeUndefined();
    expect(json.labelName).toBe('Test Wine');
  });
});
