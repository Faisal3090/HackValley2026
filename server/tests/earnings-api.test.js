import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signToken } from '../src/middleware/auth.js';
import { createTestContext, resetTestDb, seedFourDriverFixture } from './helpers/testDb.js';

describe('Driver earnings settings and ride lifecycle', () => {
  const { app, pool, config } = createTestContext({ OFFER_TIMEOUT_SECONDS: '60', DEMO_MODE: 'false' });
  let fixture, token, paxToken;
  const settings = { fuelCostPerKm: 5, maintenanceCostPerKm: 1, base: { lat: 15.85, lng: 74.5 } };
  beforeEach(async () => {
    await resetTestDb(pool);
    fixture = await seedFourDriverFixture(pool, config);
    token = signToken(fixture.drivers[0].user, config);
    paxToken = signToken(fixture.passenger, config);
  });
  afterAll(async () => { await pool.end(); });
  const call = (method, url, auth = token) => request(app)[method](`/api/v1${url}`).set('Authorization', `Bearer ${auth}`);

  it('persists only the authenticated driver settings and rejects invalid inputs or passenger access', async () => {
    expect((await call('put', '/drivers/me/cost-settings').send(settings)).status).toBe(200);
    expect((await call('get', '/drivers/me/cost-settings')).body).toMatchObject({ ...settings, commissionPercent: 20 });
    const other = signToken(fixture.drivers[1].user, config);
    expect((await call('get', '/drivers/me/cost-settings', other)).body.fuelCostPerKm).toBeNull();
    expect((await call('put', '/drivers/me/cost-settings').send({ ...settings, fuelCostPerKm: -1 })).status).toBe(400);
    expect((await call('put', '/drivers/me/cost-settings').send({ ...settings, base: { lat: 91, lng: 0 } })).status).toBe(400);
    expect((await call('put', '/drivers/me/cost-settings', paxToken).send(settings)).status).toBe(403);
  });

  async function acceptRide() {
    await call('put', '/drivers/me/cost-settings').send(settings);
    const created = await call('post', '/rides', paxToken).send({
      pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
      drop: { lat: config.CITY_CENTER_LAT + 0.02, lng: config.CITY_CENTER_LNG + 0.02 },
      vehicleType: 'HATCHBACK',
    });
    expect(created.status).toBe(201);
    const offered = await call('get', '/drivers/me/offer');
    expect(offered.body.offer.earnings.available).toBe(true);
    expect((await call('post', `/offers/${created.body.currentOffer.id}/respond`).send({ action: 'accept' })).status).toBe(200);
    return created.body.id;
  }

  it('freezes accepted costs and updates actual distance in driver history without changing fare', async () => {
    const id = await acceptRide();
    const active = (await call('get', '/drivers/me/active-ride')).body.ride;
    expect(active.earnings.fuelCostPerKm).toBe(5);
    await call('put', '/drivers/me/cost-settings').send({ ...settings, fuelCostPerKm: 99 });
    expect((await call('post', `/rides/${id}/advance`).send({ actualPassengerDistanceKm: 12 })).status).toBe(400);
    await call('post', `/rides/${id}/advance`);
    await call('post', `/rides/${id}/advance`);
    expect((await call('post', `/rides/${id}/advance`).send({ actualPassengerDistanceKm: -1 })).status).toBe(400);
    const completed = await call('post', `/rides/${id}/advance`).send({ actualPassengerDistanceKm: 12 });
    expect(completed.status).toBe(200);
    expect(completed.body.finalFare).toBe(active.estimatedFare);
    const history = (await call('get', '/rides/history')).body.rides[0];
    expect(history.earnings).toMatchObject({ fuelCostPerKm: 5, passengerDistanceKm: 12, emptyReturnEstimated: true, passengerDistanceBasis: 'driver-reported actual' });
    expect(history.earnings.pickupDistanceKm).toBe(active.earnings.pickupDistanceKm);
    expect((await call('get', '/rides/history', paxToken)).body.rides[0].earnings).toBeUndefined();
  });

  it('keeps passenger distance estimated when no actual distance is supplied', async () => {
    const id = await acceptRide();
    for (let i = 0; i < 3; i++) expect((await call('post', `/rides/${id}/advance`)).status).toBe(200);
    const history = (await call('get', '/rides/history')).body.rides[0];
    expect(history.earnings.passengerDistanceBasis).toBe('estimated route');
  });
});
