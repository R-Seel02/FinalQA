import request from 'supertest';
import { buildApp } from '../src/app';
import { User } from '../src/models/User';
import { env } from '../src/config/env';

const app = buildApp();

describe('Auth: registration (US-001)', () => {
  it('AC-001.1 registers a customer with a valid email and complex password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'new@example.com',
        password: 'StrongPass1!',
        shippingAddress: '1 Test St'
      });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user.role).toBe('customer');
  });

  it('AC-001.2 rejects a duplicate email with HTTP 409', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dup@example.com',
      password: 'StrongPass1!'
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@example.com',
      password: 'StrongPass1!'
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('AC-001.1 rejects passwords missing required character classes', async () => {
    const cases = [
      'lowercase1!',     // no uppercase
      'NoDigits!!',      // no digit
      'NoSymbol1A',      // no symbol
      'Short1!',         // too short
      ''                 // empty
    ];
    for (const password of cases) {
      const res = await request(app).post('/api/auth/register').send({
        email: `weak-${password}@test.com`,
        password
      });
      expect(res.status).toBe(400);
    }
  });

  it('rejects an invalid email format', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      password: 'StrongPass1!'
    });
    expect(res.status).toBe(400);
  });
});

describe('Auth: login and lockout (US-002)', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      email: 'login@example.com',
      password: 'StrongPass1!'
    });
  });

  it('AC-002.1 returns a token and user payload on success', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'StrongPass1!'
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('customer');
  });

  it('AC-001.2 returns generic error on bad password (no enumeration)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'WrongPass1!'
    });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('invalid credentials');
  });

  it('AC-001.2 returns generic error on non-existent email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'StrongPass1!'
    });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('invalid credentials');
  });

  it('AC-002.2 locks the account after the threshold and returns 429', async () => {
    for (let i = 0; i < env.lockoutMaxAttempts - 1; i++) {
      const res = await request(app).post('/api/auth/login').send({
        email: 'login@example.com',
        password: 'WrongPass1!'
      });
      expect(res.status).toBe(401);
    }
    const finalRes = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'WrongPass1!'
    });
    expect(finalRes.status).toBe(429);

    // Even a correct password should now be rejected during lockout
    const correctRes = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'StrongPass1!'
    });
    expect(correctRes.status).toBe(429);
  });

  it('AC-002.1 routes a concierge to the staff role in the response', async () => {
    await User.findOneAndUpdate(
      { email: 'login@example.com' },
      { role: 'concierge' }
    );
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'StrongPass1!'
    });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('concierge');
  });
});
