import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../src/middleware/auth.js';
import { calculateFare } from '../src/services/fare.js';
import { clearRoutingCache } from '../src/services/routing.js';
import {
  createTestContext,
  resetTestDb,
  seedFourDriverFixture,
} from './helpers/testDb.js';

describe('Ride Lifecycle, Constraints, History, Cancel, and Routing (Tests 13-20)', () => {
  const { app, pool, config } = createTestContext();

  beforeAll(async () => {
    await resetTestDb(pool);
  });

  beforeEach(async () => {
    clearRoutingCache();
    await resetTestDb(pool);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await pool.end();
  });

  async function createAndAcceptRide(fixture) {
    const paxToken = signToken(fixture.passenger, config);
    const d1Token = signToken(fixture.drivers[0].user, config);
    const rideRes = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${paxToken}`)
      .send({
        pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
        drop: {
          lat: config.CITY_CENTER_LAT + 0.02,
          lng: config.CITY_CENTER_LNG + 0.02,
        },
        pickupLabel: 'Pickup A',
        dropLabel: 'Drop B',
      });
    const offerId = rideRes.body.currentOffer.id;
    await request(app)
      .post(`/api/v1/offers/${offerId}/respond`)
      .set('Authorization', `Bearer ${d1Token}`)
      .send({ action: 'accept' });
    return { ride: rideRes.body, paxToken, d1Token };
  }

  it('13. completes full path ACCEPTED -> ARRIVING -> ONGOING -> COMPLETED and frees driver', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const { ride, d1Token } = await createAndAcceptRide(fixture);
    const driver1Id = fixture.drivers[0].driver.id;

    const s1 = await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);
    expect(s1.status).toBe(200);
    expect(s1.body.status).toBe('ARRIVING');

    const s2 = await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);
    expect(s2.status).toBe(200);
    expect(s2.body.status).toBe('ONGOING');

    const s3 = await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);
    expect(s3.status).toBe(200);
    expect(s3.body.status).toBe('COMPLETED');
    expect(s3.body.finalFare).toBe(ride.estimatedFare);

    const drvRow = await pool.query(
      'SELECT status, rides_completed FROM drivers WHERE id = $1',
      [driver1Id]
    );
    expect(drvRow.rows[0].status).toBe('AVAILABLE');
    expect(drvRow.rows[0].rides_completed).toBe(1);
  });

  it('14. prevents skipping states and blocks non-assigned driver from advancing (403)', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const { ride, d1Token } = await createAndAcceptRide(fixture);
    const d2Token = signToken(fixture.drivers[1].user, config);

    const otherAdvance = await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d2Token}`);
    expect(otherAdvance.status).toBe(403);

    // Advance cleanly through completion, then further advance must fail with 409
    await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);
    await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);
    await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);

    const afterComplete = await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);
    expect(afterComplete.status).toBe(409);
  });

  it('15. calculates fare accurately for every vehicle type and stores fare_breakdown on ride creation', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);

    const vehicles = ['AUTO', 'HATCHBACK', 'SEDAN', 'SUV'];
    for (const vehicleType of vehicles) {
      const res = await request(app)
        .post('/api/v1/rides/estimate')
        .set('Authorization', `Bearer ${paxToken}`)
        .send({
          pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
          drop: {
            lat: config.CITY_CENTER_LAT + 0.02,
            lng: config.CITY_CENTER_LNG + 0.02,
          },
          vehicleType,
        });

      expect(res.status).toBe(200);
      const expected = calculateFare({
        tripDistanceKm: res.body.tripDistanceKm,
        vehicleType,
        cfg: config,
      });

      expect(res.body.estimatedFare).toBe(expected.total);
      expect(res.body.fareBreakdown.vehicleType).toBe(vehicleType);
      expect(res.body.fareBreakdown.total).toBe(expected.total);
      expect(res.body.fareBreakdown.driverPayout).toBe(expected.driverPayout);
      expect(res.body.fareBreakdown.platformFee).toBe(expected.platformFee);
    }

    const bikeEstimate = await request(app)
      .post('/api/v1/rides/estimate')
      .set('Authorization', `Bearer ${paxToken}`)
      .send({
        pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
        drop: {
          lat: config.CITY_CENTER_LAT + 0.02,
          lng: config.CITY_CENTER_LNG + 0.02,
        },
        vehicleType: 'BIKE',
      });
    expect(bikeEstimate.status).toBe(400);

    const createRes = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${paxToken}`)
      .send({
        pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
        drop: {
          lat: config.CITY_CENTER_LAT + 0.02,
          lng: config.CITY_CENTER_LNG + 0.02,
        },
        vehicleType: 'SEDAN',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.fareBreakdown.vehicleType).toBe('SEDAN');
    expect(createRes.body.estimatedFare).toBe(createRes.body.fareBreakdown.total);
    expect(createRes.body.fareBreakdown.driverPayout).toBeDefined();
    expect(createRes.body.fareBreakdown.platformFee).toBeDefined();
  });

  it('16. prevents passenger from creating two active rides (409) and enforces one active ride per driver in DB', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const { ride, paxToken } = await createAndAcceptRide(fixture);

    const secondRide = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${paxToken}`)
      .send({
        pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
        drop: {
          lat: config.CITY_CENTER_LAT + 0.01,
          lng: config.CITY_CENTER_LNG + 0.01,
        },
      });
    expect(secondRide.status).toBe(409);

    // Second passenger trying to assign same BUSY driver directly violates DB unique index
    const otherPaxRes = await request(app).post('/api/v1/auth/register').send({
      username: 'pax_second',
      email: 'pax_second@example.com',
      password: 'secret123',
      role: 'passenger',
      name: 'Second Pax',
    });

    await expect(
      pool.query(
        `INSERT INTO rides (
           passenger_id, pickup_lat, pickup_lng, drop_lat, drop_lng,
           status, current_driver_id
         )
         VALUES ($1, 15.85, 74.50, 15.86, 74.51, 'ACCEPTED', $2)`,
        [otherPaxRes.body.user.id, ride.currentOffer.driverId]
      )
    ).rejects.toThrow();
  });

  it('17. toggles driver availability, blocks BUSY driver from going offline (409), and excludes OFFLINE drivers', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);
    const driver1 = fixture.drivers[0];
    const driver2 = fixture.drivers[1];
    const d1Token = signToken(driver1.user, config);
    const d2Token = signToken(driver2.user, config);

    const goOffline = await request(app)
      .post('/api/v1/drivers/me/availability')
      .set('Authorization', `Bearer ${d1Token}`)
      .send({ available: false });
    expect(goOffline.status).toBe(200);
    expect(goOffline.body.driver.status).toBe('OFFLINE');

    const nearbyAfterOffline = await request(app)
      .get('/api/v1/drivers/nearby')
      .query({ lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG })
      .set('Authorization', `Bearer ${paxToken}`);
    expect(nearbyAfterOffline.status).toBe(200);
    const ids = nearbyAfterOffline.body.drivers.map((d) => d.id);
    expect(ids).not.toContain(driver1.driver.id);
    expect(ids).toContain(driver2.driver.id);

    // Offline driver1 is also excluded from ride dispatch eligibility (driver2 gets offered)
    const rideRes = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${paxToken}`)
      .send({
        pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
        drop: {
          lat: config.CITY_CENTER_LAT + 0.02,
          lng: config.CITY_CENTER_LNG + 0.02,
        },
      });
    expect(rideRes.body.currentOffer.driverId).toBe(driver2.driver.id);

    await pool.query("UPDATE drivers SET status = 'BUSY' WHERE id = $1", [
      driver2.driver.id,
    ]);
    const busyOffline = await request(app)
      .post('/api/v1/drivers/me/availability')
      .set('Authorization', `Bearer ${d2Token}`)
      .send({ available: false });
    expect(busyOffline.status).toBe(409);
    expect(busyOffline.body.code).toBe('DRIVER_BUSY');
  });

  it('18. history returns only the caller rides with fare fields', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const { ride, paxToken, d1Token } = await createAndAcceptRide(fixture);

    // Complete ride
    await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);
    await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);
    await request(app)
      .post(`/api/v1/rides/${ride.id}/advance`)
      .set('Authorization', `Bearer ${d1Token}`);

    const otherPax = await request(app).post('/api/v1/auth/register').send({
      username: 'other_pax_hist',
      email: 'other_pax_hist@example.com',
      password: 'secret123',
      role: 'passenger',
      name: 'Other Pax',
    });

    const paxHist = await request(app)
      .get('/api/v1/rides/history')
      .set('Authorization', `Bearer ${paxToken}`);
    expect(paxHist.status).toBe(200);
    expect(paxHist.body.rides.length).toBe(1);
    expect(paxHist.body.rides[0].finalFare).toBe(ride.estimatedFare);
    expect(paxHist.body.rides[0].driverName).toBe('Driver One');

    const drvHist = await request(app)
      .get('/api/v1/rides/history')
      .set('Authorization', `Bearer ${d1Token}`);
    expect(drvHist.status).toBe(200);
    expect(drvHist.body.rides.length).toBe(1);

    const otherHist = await request(app)
      .get('/api/v1/rides/history')
      .set('Authorization', `Bearer ${otherPax.body.token}`);
    expect(otherHist.status).toBe(200);
    expect(otherHist.body.rides.length).toBe(0);
  });

  it('19. cancel by passenger frees assigned driver and expires pending offer', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);

    // Case A: cancel while DRIVER_OFFERED expires pending offer
    const rideA = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${paxToken}`)
      .send({
        pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
        drop: {
          lat: config.CITY_CENTER_LAT + 0.02,
          lng: config.CITY_CENTER_LNG + 0.02,
        },
      });
    const offerAId = rideA.body.currentOffer.id;

    const cancelA = await request(app)
      .post(`/api/v1/rides/${rideA.body.id}/cancel`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(cancelA.status).toBe(200);
    expect(cancelA.body.status).toBe('CANCELLED');

    const offerRow = await pool.query('SELECT status FROM offers WHERE id = $1', [
      offerAId,
    ]);
    expect(offerRow.rows[0].status).toBe('EXPIRED');

    // Case B: cancel after ACCEPTED frees BUSY driver back to AVAILABLE
    const { ride: rideB } = await createAndAcceptRide(fixture);
    const assignedDriverId = rideB.currentOffer.driverId;

    const cancelB = await request(app)
      .post(`/api/v1/rides/${rideB.id}/cancel`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(cancelB.status).toBe(200);
    expect(cancelB.body.status).toBe('CANCELLED');

    const drvRow = await pool.query('SELECT status FROM drivers WHERE id = $1', [
      assignedDriverId,
    ]);
    expect(drvRow.rows[0].status).toBe('AVAILABLE');
  });

  it('20. falls back gracefully to haversine when OSRM is unreachable', async () => {
    const osrmCtx = createTestContext({ ROUTING_PROVIDER: 'osrm' });
    const fixture = await seedFourDriverFixture(osrmCtx.pool, osrmCtx.config);
    const paxToken = signToken(fixture.passenger, osrmCtx.config);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('OSRM network unreachable'));

    try {
      const nearbyRes = await request(osrmCtx.app)
        .get('/api/v1/drivers/nearby')
        .query({
          lat: osrmCtx.config.CITY_CENTER_LAT,
          lng: osrmCtx.config.CITY_CENTER_LNG,
        })
        .set('Authorization', `Bearer ${paxToken}`);

      expect(nearbyRes.status).toBe(200);
      expect(nearbyRes.body.source).toBe('haversine');
      expect(nearbyRes.body.drivers.length).toBe(4);

      const estRes = await request(osrmCtx.app)
        .post('/api/v1/rides/estimate')
        .set('Authorization', `Bearer ${paxToken}`)
        .send({
          pickup: {
            lat: osrmCtx.config.CITY_CENTER_LAT,
            lng: osrmCtx.config.CITY_CENTER_LNG,
          },
          drop: {
            lat: osrmCtx.config.CITY_CENTER_LAT + 0.015,
            lng: osrmCtx.config.CITY_CENTER_LNG + 0.015,
          },
        });

      expect(estRes.status).toBe(200);
      expect(estRes.body.routeSource).toBe('haversine');
      expect(estRes.body.tripDistanceKm).toBeGreaterThan(0);
      expect(estRes.body.estimatedFare).toBeGreaterThan(0);
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      await osrmCtx.pool.end();
    }
  });
});
