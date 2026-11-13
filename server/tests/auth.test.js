import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signToken } from '../src/middleware/auth.js';
import {
  createTestContext,
  resetTestDb,
  seedFourDriverFixture,
} from './helpers/testDb.js';

describe('Auth & RBAC (Tests 1-3)', () => {
  const { app, pool, config } = createTestContext();

  beforeAll(async () => {
    await resetTestDb(pool);
  });

  beforeEach(async () => {
    await resetTestDb(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('1. registers passenger and driver, logs in with token, and rejects wrong password (401)', async () => {
    const paxReg = await request(app).post('/api/v1/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'secret123',
      role: 'passenger',
      name: 'Alice',
      phone: '9999999991',
    });
    expect(paxReg.status).toBe(201);
    expect(paxReg.body.token).toBeTruthy();
    expect(paxReg.body.user.role).toBe('passenger');
    expect(paxReg.body.user.email).toBe('alice@example.com');
    expect(paxReg.body.driver).toBeUndefined();

    const storedPassenger = await pool.query(
      'SELECT email FROM users WHERE username = $1',
      ['alice']
    );
    expect(storedPassenger.rows[0].email).toBe('alice@example.com');

    const drvReg = await request(app).post('/api/v1/auth/register').send({
      username: 'bob',
      email: 'bob@example.com',
      password: 'secret123',
      role: 'driver',
      name: 'Bob',
      phone: '9999999992',
      vehicleType: 'SEDAN',
      vehicleNumber: 'KA22X9999',
      licenseNumber: 'KA22-2026-001122',
    });
    expect(drvReg.status).toBe(201);
    expect(drvReg.body.token).toBeTruthy();
    expect(drvReg.body.user.role).toBe('driver');
    expect(drvReg.body.driver.status).toBe('OFFLINE');
    expect(drvReg.body.driver.vehicleType).toBe('SEDAN');
    expect(drvReg.body.driver.licenseNumber).toBe('KA22-2026-001122');

    const loginOk = await request(app).post('/api/v1/auth/login').send({
      username: 'bob',
      password: 'secret123',
    });
    expect(loginOk.status).toBe(200);
    expect(loginOk.body.token).toBeTruthy();

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginOk.body.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('bob@example.com');
    expect(meRes.body.driver.licenseNumber).toBe('KA22-2026-001122');

    const loginByEmail = await request(app).post('/api/v1/auth/login').send({
      username: 'ALICE@example.com',
      password: 'secret123',
    });
    expect(loginByEmail.status).toBe(200);
    expect(loginByEmail.body.user.username).toBe('alice');

    const loginByPhone = await request(app).post('/api/v1/auth/login').send({
      username: '9999999991',
      password: 'secret123',
    });
    expect(loginByPhone.status).toBe(200);
    expect(loginByPhone.body.user.username).toBe('alice');

    const duplicateEmail = await request(app).post('/api/v1/auth/register').send({
      username: 'another-alice',
      email: 'ALICE@example.com',
      password: 'secret123',
      role: 'passenger',
      name: 'Another Alice',
    });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.code).toBe('USERNAME_TAKEN');

    const loginBad = await request(app).post('/api/v1/auth/login').send({
      username: 'bob',
      password: 'wrong-password',
    });
    expect(loginBad.status).toBe(401);
    expect(loginBad.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('2. enforces role permissions (403) and requires authentication (401)', async () => {
    const unauth = await request(app).get('/api/v1/drivers/me');
    expect(unauth.status).toBe(401);

    const paxReg = await request(app).post('/api/v1/auth/register').send({
      username: 'pax1',
      email: 'pax1@example.com',
      password: 'secret123',
      role: 'passenger',
      name: 'Pax One',
    });
    const drvReg = await request(app).post('/api/v1/auth/register').send({
      username: 'drv1',
      email: 'drv1@example.com',
      password: 'secret123',
      role: 'driver',
      name: 'Drv One',
      vehicleType: 'AUTO',
    });

    const missingEmail = await request(app).post('/api/v1/auth/register').send({
      username: 'no_email',
      password: 'secret123',
      role: 'passenger',
      name: 'No Email',
    });
    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body.code).toBe('VALIDATION_ERROR');

    const paxCallingDriver = await request(app)
      .post('/api/v1/drivers/me/availability')
      .set('Authorization', `Bearer ${paxReg.body.token}`)
      .send({ available: true });
    expect(paxCallingDriver.status).toBe(403);
    expect(paxCallingDriver.body.code).toBe('FORBIDDEN');

    const drvCallingEstimate = await request(app)
      .post('/api/v1/rides/estimate')
      .set('Authorization', `Bearer ${drvReg.body.token}`)
      .send({
        pickup: { lat: 15.85, lng: 74.5 },
        drop: { lat: 15.87, lng: 74.52 },
      });
    expect(drvCallingEstimate.status).toBe(403);
    expect(drvCallingEstimate.body.code).toBe('FORBIDDEN');

    const drvCreatingRide = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${drvReg.body.token}`)
      .send({
        pickup: { lat: 15.85, lng: 74.5 },
        drop: { lat: 15.87, lng: 74.52 },
      });
    expect(drvCreatingRide.status).toBe(403);
    expect(drvCreatingRide.body.code).toBe('FORBIDDEN');
  });

  it('3. with DEMO_MODE=false, a driver cannot respond to another driver offer (403)', async () => {
    const strictCtx = createTestContext({ DEMO_MODE: 'false' });
    try {
      const fixture = await seedFourDriverFixture(strictCtx.pool, strictCtx.config);
      const paxToken = signToken(fixture.passenger, strictCtx.config);

      const rideRes = await request(strictCtx.app)
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${paxToken}`)
        .send({
          pickup: {
            lat: strictCtx.config.CITY_CENTER_LAT,
            lng: strictCtx.config.CITY_CENTER_LNG,
          },
          drop: {
            lat: strictCtx.config.CITY_CENTER_LAT + 0.02,
            lng: strictCtx.config.CITY_CENTER_LNG + 0.02,
          },
        });

      expect(rideRes.status).toBe(201);
      expect(rideRes.body.currentOffer).toBeTruthy();
      const offerId = rideRes.body.currentOffer.id;
      const offeredDriverId = rideRes.body.currentOffer.driverId;

      const otherDriver = fixture.drivers.find(
        (d) => d.driver.id !== offeredDriverId
      );
      const otherToken = signToken(otherDriver.user, strictCtx.config);

      const res = await request(strictCtx.app)
        .post(`/api/v1/offers/${offerId}/respond`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    } finally {
      await strictCtx.pool.end();
    }
  });
});
