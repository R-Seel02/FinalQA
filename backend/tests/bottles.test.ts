import request from 'supertest';
import { buildApp } from '../src/app';
import { createTestUser } from './helpers';

const app = buildApp();

describe('Bottles: create (US-011)', () => {
  it('AC-011.1 creates a bottle with valid inputs', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const res = await request(app)
      .post('/api/bottles')
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        labelName: 'Inglenook',
        producer: 'Inglenook',
        vintage: 2015,
        region: 'Napa Valley',
        varietal: 'Cabernet',
        photoUrl: 'https://example.com/inglenook.jpg',
        retailValueCents: 25000_00,
        pricePerNightCents: 50_00
      });
    expect(res.status).toBe(201);
    expect(res.body.depositCents).toBe(25000_00);
    expect(res.body.state).toBe('available');
  });

  it('AC-011.2 rejects negative retail value', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const res = await request(app)
      .post('/api/bottles')
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        labelName: 'Bad',
        producer: 'Bad',
        vintage: 2015,
        region: 'X',
        varietal: 'Y',
        photoUrl: 'z',
        retailValueCents: -100,
        pricePerNightCents: 50_00
      });
    expect(res.status).toBe(400);
  });

  it('AC-011.1 rejects vintage of 1899 (just below boundary)', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const res = await request(app)
      .post('/api/bottles')
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        labelName: 'Vintage edge',
        producer: 'X',
        vintage: 1899,
        region: 'X',
        varietal: 'Y',
        photoUrl: 'z',
        retailValueCents: 1000,
        pricePerNightCents: 100
      });
    expect(res.status).toBe(400);
  });

  it('AC-011.1 accepts vintage of 1900 (lower boundary)', async () => {
    const concierge = await createTestUser({ role: 'concierge' });
    const res = await request(app)
      .post('/api/bottles')
      .set('Authorization', `Bearer ${concierge.token}`)
      .send({
        labelName: 'Old vintage',
        producer: 'X',
        vintage: 1900,
        region: 'X',
        varietal: 'Y',
        photoUrl: 'z',
        retailValueCents: 1000,
        pricePerNightCents: 100
      });
    expect(res.status).toBe(201);
  });

  it('returns 403 when a customer attempts to create a bottle', async () => {
    const customer = await createTestUser({ role: 'customer' });
    const res = await request(app)
      .post('/api/bottles')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        labelName: 'X',
        producer: 'Y',
        vintage: 2018,
        region: 'X',
        varietal: 'Y',
        photoUrl: 'z',
        retailValueCents: 1000,
        pricePerNightCents: 100
      });
    expect(res.status).toBe(403);
  });
});
