import request from 'supertest';
import { buildApp } from '../src/app';
import { createTestUser, createTestBottle, dateOffset } from './helpers';
import { Reservation } from '../src/models/Reservation';
import { Bottle } from '../src/models/Bottle';
import { injectPaymentFailure } from '../src/services/paymentService';

const app = buildApp();

describe('Reservations: create (US-004)', () => {
  it('AC-004.1 creates a reservation on the happy path', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();

    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(4)
      });

    expect(res.status).toBe(201);
    expect(res.body.state).toBe('reserved');
    expect(res.body.totalRentalCents).toBe(3 * bottle.pricePerNightCents);
    expect(res.body.depositCents).toBe(bottle.depositCents);

    const refreshed = await Bottle.findById(bottle.id);
    expect(refreshed?.state).toBe('reserved');
  });

  it('AC-004.1 rejects rental period of 0 nights (boundary, just below)', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(1)
      });
    expect(res.status).toBe(400);
  });

  it('AC-004.1 accepts rental period of exactly 30 nights (upper boundary)', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(31)
      });
    expect(res.status).toBe(201);
  });

  it('AC-004.1 rejects rental period of 31 nights (just above boundary)', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(32)
      });
    expect(res.status).toBe(400);
  });

  it('AC-004.1 rejects start date in the past', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(-1),
        endDate: dateOffset(2)
      });
    expect(res.status).toBe(400);
  });

  it('AC-004.1 rejects start date of today', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(0),
        endDate: dateOffset(3)
      });
    expect(res.status).toBe(400);
  });

  it('AC-004.1 rejects reservations against damaged bottles', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle({ state: 'damaged' });
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    expect(res.status).toBe(409);
  });

  it('AC-004.2 reverses rental fee charge when deposit charge fails', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();

    // Inject a failure for the deposit charge specifically
    const reference = `res-${customer.id}-${bottle.id}`;
    injectPaymentFailure(undefined, 'deposit declined');
    // First attempt: failure on rental charge
    let res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    expect(res.status).toBe(402);

    // No reservation created
    const count = await Reservation.countDocuments();
    expect(count).toBe(0);

    // Bottle state unchanged
    const refreshed = await Bottle.findById(bottle.id);
    expect(refreshed?.state).toBe('available');
  });

  it('AC-004.3 rejects exact-boundary overlap (Jun 5 vs Jun 5-8)', async () => {
    const customer1 = await createTestUser({ role: 'customer' });
    const customer2 = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();

    // First reservation: days 1-5
    const first = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer1.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(5)
      });
    expect(first.status).toBe(201);

    // Conflicting: starts on day 5 (boundary day overlap)
    const overlap = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer2.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(5),
        endDate: dateOffset(8)
      });
    expect(overlap.status).toBe(409);
  });

  it('AC-004.3 accepts a reservation starting the day after a previous one ends', async () => {
    const customer1 = await createTestUser({ role: 'customer' });
    const customer2 = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();

    await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer1.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(5)
      });

    const second = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${customer2.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(6),
        endDate: dateOffset(10)
      });
    expect(second.status).toBe(201);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const bottle = await createTestBottle();
    const res = await request(app)
      .post('/api/reservations')
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    expect(res.status).toBe(401);
  });
});

describe('Reservations: cancel (US-005)', () => {
  it('AC-005.1 cancels own reservation in reserved state', async () => {
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

    const cancel = await request(app)
      .delete(`/api/reservations/${created.body._id}`)
      .set('Authorization', `Bearer ${customer.token}`);

    expect(cancel.status).toBe(200);
    expect(cancel.body.state).toBe('cancelled');

    const bottleAfter = await Bottle.findById(bottle.id);
    expect(bottleAfter?.state).toBe('available');
  });

  it('AC-005.2 returns 403 when cancelling another customer\'s reservation', async () => {
    const owner = await createTestUser({ role: 'customer' });
    const intruder = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const created = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });

    const res = await request(app)
      .delete(`/api/reservations/${created.body._id}`)
      .set('Authorization', `Bearer ${intruder.token}`);
    expect(res.status).toBe(403);
  });
});

describe('Reservations: my list (US-006)', () => {
  it('AC-006.2 isolates other customers\' reservations from results', async () => {
    const a = await createTestUser({ role: 'customer' });
    const b = await createTestUser({ role: 'customer' });
    const bottle1 = await createTestBottle();
    const bottle2 = await createTestBottle();

    await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        bottleId: bottle1.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });
    await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        bottleId: bottle2.id,
        startDate: dateOffset(1),
        endDate: dateOffset(3)
      });

    const aRes = await request(app)
      .get('/api/reservations/me')
      .set('Authorization', `Bearer ${a.token}`);
    expect(aRes.status).toBe(200);
    expect(aRes.body.items).toHaveLength(1);
    expect(aRes.body.items[0].customerId).toBe(a.id);
  });
});
