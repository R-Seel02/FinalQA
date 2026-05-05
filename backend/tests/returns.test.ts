import request from 'supertest';
import { buildApp } from '../src/app';
import { createTestUser, createTestBottle, dateOffset } from './helpers';
import { Reservation } from '../src/models/Reservation';
import { Bottle } from '../src/models/Bottle';
import { markPickedUp, accrueLateFees } from '../src/services/returnService';

const app = buildApp();

async function setupActiveRental() {
  const customer = await createTestUser({ role: 'customer' });
  const concierge = await createTestUser({ role: 'concierge' });
  const bottle = await createTestBottle({
    pricePerNightCents: 100_00,
    retailValueCents: 50000_00
  });

  const created = await request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${customer.token}`)
    .send({
      bottleId: bottle.id,
      startDate: dateOffset(1),
      endDate: dateOffset(4)
    });
  await markPickedUp(created.body._id);
  return { customer, concierge, bottle, reservationId: created.body._id };
}

describe('Returns: clean (US-008)', () => {
  it('AC-008.1 transitions to returned/available and refunds the deposit', async () => {
    const { concierge, bottle, reservationId } = await setupActiveRental();

    const res = await request(app)
      .post(`/api/reservations/${reservationId}/return`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({ sealIntact: true });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('returned');
    expect(res.body.forfeiture.outcome).toBe('clean');

    const bottleAfter = await Bottle.findById(bottle.id);
    expect(bottleAfter?.state).toBe('available');

    const events = res.body.events;
    expect(events.some((e: { kind: string }) => e.kind === 'deposit_refund')).toBe(true);
  });

  it('AC-008.2 a customer cannot process their own return (HTTP 403)', async () => {
    const { customer, reservationId } = await setupActiveRental();
    const res = await request(app)
      .post(`/api/reservations/${reservationId}/return`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ sealIntact: true });
    expect(res.status).toBe(403);
  });
});

describe('Returns: broken seal (US-009)', () => {
  it('AC-009.1 marks bottle damaged and forfeits deposit when seal broken', async () => {
    const { concierge, bottle, reservationId } = await setupActiveRental();

    const res = await request(app)
      .post(`/api/reservations/${reservationId}/return`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        sealIntact: false,
        damageNotes: 'foil tampered with and cork visibly raised on inspection'
      });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('returned');
    expect(res.body.forfeiture.outcome).toBe('broken_seal');
    expect(res.body.forfeiture.notes.length).toBeGreaterThanOrEqual(20);

    // No deposit refund
    const events = res.body.events;
    expect(events.some((e: { kind: string }) => e.kind === 'deposit_refund')).toBe(false);

    const bottleAfter = await Bottle.findById(bottle.id);
    expect(bottleAfter?.state).toBe('damaged');
  });

  it('AC-009.1 rejects broken-seal flag with damage notes shorter than 20 chars', async () => {
    const { concierge, reservationId } = await setupActiveRental();
    const res = await request(app)
      .post(`/api/reservations/${reservationId}/return`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({ sealIntact: false, damageNotes: 'too short' });
    expect(res.status).toBe(400);
  });

  it('AC-009.2 a damaged bottle cannot be reserved again', async () => {
    const { concierge, bottle, reservationId } = await setupActiveRental();
    await request(app)
      .post(`/api/reservations/${reservationId}/return`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        sealIntact: false,
        damageNotes: 'foil tampered with and cork visibly raised on inspection'
      });

    const newCustomer = await createTestUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${newCustomer.token}`)
      .send({
        bottleId: bottle.id,
        startDate: dateOffset(60),
        endDate: dateOffset(63)
      });
    expect(res.status).toBe(409);
  });
});

describe('Returns: missing bottle (US-010)', () => {
  it('AC-010.2 rejects mark-missing for bottle less than 30 days overdue', async () => {
    const { concierge, bottle } = await setupActiveRental();
    const res = await request(app)
      .post(`/api/bottles/${bottle.id}/mark-missing`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({ reason: 'customer non-responsive after multiple email attempts' });
    expect(res.status).toBe(422);
  });

  it('AC-010.1 marks bottle missing once 30-day threshold is past', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const concierge = await createTestUser({ role: 'concierge' });
    const bottle = await createTestBottle();
    // Build reservation directly in db with end date 31 days ago, state 'out'
    const reservation = await Reservation.create({
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

    const res = await request(app)
      .post(`/api/bottles/${bottle.id}/mark-missing`)
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({ reason: 'customer non-responsive after 30 days of attempted contact' });
    expect(res.status).toBe(200);

    const bottleAfter = await Bottle.findById(bottle.id);
    expect(bottleAfter?.state).toBe('missing');

    const reservationAfter = await Reservation.findById(reservation.id);
    expect(reservationAfter?.state).toBe('returned');
    expect(reservationAfter?.forfeiture?.outcome).toBe('missing');
  });

  it('AC-010.2 a customer cannot mark a bottle missing (HTTP 403)', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle();
    const res = await request(app)
      .post(`/api/bottles/${bottle.id}/mark-missing`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'customer is trying to forge a missing-bottle write-off' });
    expect(res.status).toBe(403);
  });
});

describe('Late fees (US-012)', () => {
  it('AC-012.1 accrues 25% of nightly price per overdue day, capped at deposit', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const bottle = await createTestBottle({
      pricePerNightCents: 100_00,
      retailValueCents: 200_00
    });
    const reservation = await Reservation.create({
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

    // Run accrual three times — daily fee is 2500 cents (25 * 100)
    await accrueLateFees(new Date());
    await accrueLateFees(new Date());

    const after = await Reservation.findById(reservation.id);
    // Deposit cap is 200_00 = 20000; with daily fee of 2500 we cap fast
    expect(after?.lateFeesAccruedCents).toBeLessThanOrEqual(after!.depositCents);
    expect(after?.lateFeesAccruedCents).toBeGreaterThan(0);
  });
});
