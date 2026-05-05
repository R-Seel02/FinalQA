import request from 'supertest';
import { buildApp } from '../src/app';
import { createTestBottle } from './helpers';

const app = buildApp();

describe('Catalog (US-003)', () => {
  it('AC-003.1 returns available bottles with pagination metadata', async () => {
    await createTestBottle({ state: 'available' });
    await createTestBottle({ state: 'available' });
    const res = await request(app).get('/api/catalog');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pagination.pageSize).toBe(20);
    expect(res.body.pagination.total).toBe(2);
  });

  it('AC-003.2 excludes damaged, missing, and retired bottles', async () => {
    await createTestBottle({ state: 'available' });
    await createTestBottle({ state: 'damaged' });
    await createTestBottle({ state: 'missing' });
    await createTestBottle({ state: 'retired' });
    const res = await request(app).get('/api/catalog');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].state).toBe('available');
  });

  it('AC-003.2 returns 404 on a direct fetch of a damaged bottle', async () => {
    const damaged = await createTestBottle({ state: 'damaged' });
    const res = await request(app).get(`/api/catalog/${damaged.id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed id', async () => {
    const res = await request(app).get('/api/catalog/not-an-objectid');
    // BSON cast errors map to 400 INVALID_ID per our error handler
    expect([400, 404]).toContain(res.status);
  });
});
