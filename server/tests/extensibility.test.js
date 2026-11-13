import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { eligibilityRules } from '../src/hooks/eligibilityRules.js';
import { recoveryStrategies } from '../src/hooks/recoveryStrategies.js';
import { signToken } from '../src/middleware/auth.js';
import { DriverRanker } from '../src/rankers/base.js';
import { getRanker, registerRanker, registry } from '../src/rankers/index.js';
import { recoverRide } from '../src/services/recovery.js';
import { flushSubscribers, registerSubscribers } from '../src/services/subscribers.js';
import {
  createTestContext,
  resetTestDb,
  seedFourDriverFixture,
} from './helpers/testDb.js';

class ReverseNearestRanker extends DriverRanker {
  rank(ctx) {
    return [...ctx.candidates]
      .sort((a, b) => b.distanceKm - a.distanceKm)
      .map(({ driver, distanceKm, etaMin }) => ({
        driver,
        score: Number((distanceKm * 10).toFixed(2)),
        distanceKm,
        etaMin,
        factors: { reverseDistance: distanceKm },
        reason: `Farthest driver test ranker (${distanceKm} km)`,
      }));
  }
}

class ThrowingRanker extends DriverRanker {
  rank() {
    throw new Error('Simulated ranker crash');
  }
}

describe('Extensibility & Integration Contract (Tests 21-25)', () => {
  const baseCtx = createTestContext();

  beforeAll(async () => {
    await resetTestDb(baseCtx.pool);
  });

  beforeEach(async () => {
    registerSubscribers(baseCtx.pool);
    await resetTestDb(baseCtx.pool);
    delete registry['reverse-nearest'];
    delete registry['broken-ranker'];
  });

  afterAll(async () => {
    await flushSubscribers();
    await baseCtx.pool.end();
  });

  it('21. registers custom ranker and uses it via RANKER; unknown ranker fails clearly at startup/config', async () => {
    expect(() => getRanker('nonexistent-ranker')).toThrow(/Unknown ranker/);

    const badConfig = loadConfig({
      NODE_ENV: 'test',
      RANKER: 'nonexistent-ranker',
      FAIR_DISPATCH_ENABLED: 'true',
    });
    expect(() =>
      createApp({ pool: baseCtx.pool, config: badConfig })
    ).toThrow(/Unknown ranker/);

    registerRanker('reverse-nearest', new ReverseNearestRanker());
    const customCtx = createTestContext({ RANKER: 'reverse-nearest' });
    try {
      const fixture = await seedFourDriverFixture(customCtx.pool, customCtx.config);
      const paxToken = signToken(fixture.passenger, customCtx.config);

      const rideRes = await request(customCtx.app)
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${paxToken}`)
        .send({
          pickup: {
            lat: customCtx.config.CITY_CENTER_LAT,
            lng: customCtx.config.CITY_CENTER_LNG,
          },
          drop: {
            lat: customCtx.config.CITY_CENTER_LAT + 0.02,
            lng: customCtx.config.CITY_CENTER_LNG + 0.02,
          },
        });

      expect(rideRes.status).toBe(201);
      // Driver 4 is farthest from city center in fixture
      expect(rideRes.body.currentOffer.driverId).toBe(fixture.drivers[3].driver.id);
      expect(rideRes.body.rankerUsed).toBe('reverse-nearest');
      expect(rideRes.body.fellBack).toBe(false);
    } finally {
      await customCtx.pool.end();
    }
  });

  it('22. throwing ranker falls back to nearest with fellBack=true and still creates offer', async () => {
    registerRanker('broken-ranker', new ThrowingRanker());
    const brokenCtx = createTestContext({ RANKER: 'broken-ranker' });
    try {
      const fixture = await seedFourDriverFixture(brokenCtx.pool, brokenCtx.config);
      const paxToken = signToken(fixture.passenger, brokenCtx.config);

      const rideRes = await request(brokenCtx.app)
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${paxToken}`)
        .send({
          pickup: {
            lat: brokenCtx.config.CITY_CENTER_LAT,
            lng: brokenCtx.config.CITY_CENTER_LNG,
          },
          drop: {
            lat: brokenCtx.config.CITY_CENTER_LAT + 0.02,
            lng: brokenCtx.config.CITY_CENTER_LNG + 0.02,
          },
        });

      expect(rideRes.status).toBe(201);
      expect(rideRes.body.status).toBe('DRIVER_OFFERED');
      expect(rideRes.body.currentOffer.driverId).toBe(fixture.drivers[0].driver.id);
      expect(rideRes.body.rankerUsed).toBe('nearest');
      expect(rideRes.body.fellBack).toBe(true);
    } finally {
      await brokenCtx.pool.end();
    }
  });

  it('23. FAIR_DISPATCH_ENABLED=false forces nearest ranker regardless of RANKER', async () => {
    registerRanker('reverse-nearest', new ReverseNearestRanker());
    const disabledCtx = createTestContext({
      RANKER: 'reverse-nearest',
      FAIR_DISPATCH_ENABLED: 'false',
    });
    try {
      const fixture = await seedFourDriverFixture(disabledCtx.pool, disabledCtx.config);
      const paxToken = signToken(fixture.passenger, disabledCtx.config);

      const rideRes = await request(disabledCtx.app)
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${paxToken}`)
        .send({
          pickup: {
            lat: disabledCtx.config.CITY_CENTER_LAT,
            lng: disabledCtx.config.CITY_CENTER_LNG,
          },
          drop: {
            lat: disabledCtx.config.CITY_CENTER_LAT + 0.02,
            lng: disabledCtx.config.CITY_CENTER_LNG + 0.02,
          },
        });

      expect(rideRes.status).toBe(201);
      expect(rideRes.body.currentOffer.driverId).toBe(fixture.drivers[0].driver.id);
      expect(rideRes.body.rankerUsed).toBe('nearest');
      expect(rideRes.body.fellBack).toBe(false);
    } finally {
      await disabledCtx.pool.end();
    }
  });

  it('24. custom eligibility rule excludes expected driver and custom recovery strategy is invoked', async () => {
    const fixture = await seedFourDriverFixture(baseCtx.pool, baseCtx.config);
    const paxToken = signToken(fixture.passenger, baseCtx.config);
    const excludedDriverId = fixture.drivers[0].driver.id;

    const excludeDriver1 = (driver) => driver.id !== excludedDriverId;
    eligibilityRules.push(excludeDriver1);

    let customStrategyInvoked = false;
    recoveryStrategies.custom_escalation = async ({ ride, markUnfulfilled, client, events }) => {
      customStrategyInvoked = true;
      await markUnfulfilled(client, ride, 'custom_escalation', events);
      return { recovered: false, status: 'UNFULFILLED' };
    };

    try {
      const rideRes = await request(baseCtx.app)
        .post('/api/v1/rides')
        .set('Authorization', `Bearer ${paxToken}`)
        .send({
          pickup: {
            lat: baseCtx.config.CITY_CENTER_LAT,
            lng: baseCtx.config.CITY_CENTER_LNG,
          },
          drop: {
            lat: baseCtx.config.CITY_CENTER_LAT + 0.02,
            lng: baseCtx.config.CITY_CENTER_LNG + 0.02,
          },
        });

      expect(rideRes.status).toBe(201);
      // Driver 1 excluded by custom rule -> Driver 2 gets offered
      expect(rideRes.body.currentOffer.driverId).toBe(fixture.drivers[1].driver.id);

      // Expire current pending offer manually then invoke custom recovery strategy
      await baseCtx.pool.query(
        `UPDATE offers SET status = 'EXPIRED' WHERE id = $1`,
        [rideRes.body.currentOffer.id]
      );
      const recRes = await recoverRide(rideRes.body.id, 'custom_escalation', {
        pool: baseCtx.pool,
        config: baseCtx.config,
      });

      expect(customStrategyInvoked).toBe(true);
      expect(recRes.status).toBe('UNFULFILLED');
    } finally {
      const idx = eligibilityRules.indexOf(excludeDriver1);
      if (idx !== -1) eligibilityRules.splice(idx, 1);
      delete recoveryStrategies.custom_escalation;
    }
  });

  it('25. POST /dispatch/allocate ranks candidates without creating offers and enforces service key', async () => {
    const unauth = await request(baseCtx.app)
      .post('/api/v1/dispatch/allocate')
      .send({
        rideId: 'RIDE-101',
        pickup: { latitude: 15.8497, longitude: 74.4977 },
        candidates: [],
      });
    expect(unauth.status).toBe(401);

    const badKey = await request(baseCtx.app)
      .post('/api/v1/dispatch/allocate')
      .set('X-Service-Key', 'wrong-key')
      .send({
        rideId: 'RIDE-101',
        pickup: { latitude: 15.8497, longitude: 74.4977 },
        candidates: [],
      });
    expect(badKey.status).toBe(401);

    const okRes = await request(baseCtx.app)
      .post('/api/v1/dispatch/allocate')
      .set('X-Service-Key', baseCtx.config.SERVICE_API_KEY)
      .send({
        rideId: 'RIDE-101',
        pickup: { latitude: 15.8497, longitude: 74.4977 },
        requirements: { vehicleType: 'SEDAN', seats: 2 },
        candidates: [
          {
            driverId: 'D101',
            distanceKm: 2.5,
            pickupEtaMinutes: 7,
            online: true,
            available: true,
            vehicleType: 'SEDAN',
          },
          {
            driverId: 'D102',
            distanceKm: 1.1,
            pickupEtaMinutes: 4,
            online: true,
            available: true,
            vehicleType: 'SEDAN',
          },
          {
            driverId: 'D103',
            distanceKm: 0.4,
            pickupEtaMinutes: 2,
            online: true,
            available: true,
            vehicleType: 'AUTO',
          },
        ],
        zoneId: 'ZONE-01',
      });

    expect(okRes.status).toBe(200);
    expect(okRes.body.rideId).toBe('RIDE-101');
    expect(okRes.body.status).toBe('OFFER_READY');
    // D103 filtered out because vehicleType=AUTO != SEDAN; D102 wins over D101
    expect(okRes.body.selectedDriverId).toBe('D102');
    expect(okRes.body.rankedDrivers.map((d) => d.driverId)).toEqual(['D102', 'D101']);

    const offerCount = await baseCtx.pool.query('SELECT COUNT(*)::int AS cnt FROM offers');
    expect(offerCount.rows[0].cnt).toBe(0);
  });
});
