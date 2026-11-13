import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signToken } from '../src/middleware/auth.js';
import { expireStaleOffers } from '../src/services/offers.js';
import { flushSubscribers } from '../src/services/subscribers.js';
import {
  createTestContext,
  resetTestDb,
  seedFourDriverFixture,
} from './helpers/testDb.js';

describe('Dispatch Engine & Race Safety (Tests 4-12)', () => {
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

  async function createStandardRide(paxToken) {
    return request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${paxToken}`)
      .send({
        pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
        drop: {
          lat: config.CITY_CENTER_LAT + 0.02,
          lng: config.CITY_CENTER_LNG + 0.02,
        },
        pickupLabel: 'Central Hub',
        dropLabel: 'Tech Park',
      });
  }

  it('4. accept path sets ride ACCEPTED, current_driver_id, driver BUSY, and records events', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);
    const d1Token = signToken(fixture.drivers[0].user, config);

    const rideRes = await createStandardRide(paxToken);
    expect(rideRes.status).toBe(201);
    expect(rideRes.body.status).toBe('DRIVER_OFFERED');
    const offerId = rideRes.body.currentOffer.id;
    const offeredDriverId = rideRes.body.currentOffer.driverId;
    expect(offeredDriverId).toBe(fixture.drivers[0].driver.id);

    const acceptRes = await request(app)
      .post(`/api/v1/offers/${offerId}/respond`)
      .set('Authorization', `Bearer ${d1Token}`)
      .send({ action: 'accept' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.offer.status).toBe('ACCEPTED');
    expect(acceptRes.body.ride.status).toBe('ACCEPTED');
    expect(acceptRes.body.ride.current_driver_id).toBe(offeredDriverId);

    const drvRow = await pool.query('SELECT status FROM drivers WHERE id = $1', [
      offeredDriverId,
    ]);
    expect(drvRow.rows[0].status).toBe('BUSY');

    const eventsRes = await request(app)
      .get(`/api/v1/rides/${rideRes.body.id}/events`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(eventsRes.status).toBe(200);
    const types = eventsRes.body.events.map((e) => e.eventType);
    expect(types).toContain('DRIVER_ACCEPTED');
    expect(types).toContain('DRIVER_ASSIGNED');
    expect(types).toContain('RIDE_STATUS_CHANGED');
  });

  it('5. reject then reassign offers to a different driver and never re-offers the first', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);
    const d1Token = signToken(fixture.drivers[0].user, config);

    const rideRes = await createStandardRide(paxToken);
    const firstOffer = rideRes.body.currentOffer;
    expect(firstOffer.driverId).toBe(fixture.drivers[0].driver.id);

    const rejRes = await request(app)
      .post(`/api/v1/offers/${firstOffer.id}/respond`)
      .set('Authorization', `Bearer ${d1Token}`)
      .send({ action: 'reject' });
    expect(rejRes.status).toBe(200);
    expect(rejRes.body.offer.status).toBe('REJECTED');

    const detailRes = await request(app)
      .get(`/api/v1/rides/${rideRes.body.id}`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.status).toBe('DRIVER_OFFERED');
    expect(detailRes.body.attemptCount).toBe(2);
    expect(detailRes.body.currentOffer.driverId).toBe(fixture.drivers[1].driver.id);
    expect(detailRes.body.currentOffer.driverId).not.toBe(firstOffer.driverId);

    // Verify first driver is excluded from latestRanking on attempt 2
    const rankedIds = detailRes.body.latestRanking.map((r) => r.driverId);
    expect(rankedIds).not.toContain(firstOffer.driverId);
  });

  it('6. timeout then reassign expires backdated offer and emits OFFER_EXPIRED', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);

    const rideRes = await createStandardRide(paxToken);
    const firstOffer = rideRes.body.currentOffer;

    await pool.query(
      `UPDATE offers SET expires_at = now() - interval '5 seconds' WHERE id = $1`,
      [firstOffer.id]
    );

    const expResult = await expireStaleOffers({ pool, config });
    expect(expResult.expiredCount).toBe(1);

    const oldOfferRow = await pool.query('SELECT status FROM offers WHERE id = $1', [
      firstOffer.id,
    ]);
    expect(oldOfferRow.rows[0].status).toBe('EXPIRED');

    const detailRes = await request(app)
      .get(`/api/v1/rides/${rideRes.body.id}`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(detailRes.body.status).toBe('DRIVER_OFFERED');
    expect(detailRes.body.currentOffer.id).not.toBe(firstOffer.id);
    expect(detailRes.body.currentOffer.driverId).toBe(fixture.drivers[1].driver.id);
    expect(detailRes.body.lastExpiredOfferId).toBe(firstOffer.id);

    const eventsRes = await request(app)
      .get(`/api/v1/rides/${rideRes.body.id}/events`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(eventsRes.body.events.map((e) => e.eventType)).toContain('OFFER_EXPIRED');
  });

  it('7. late accept after expiry returns 409, leaves ride unchanged, and records LATE_RESPONSE_REJECTED', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);
    const d1Token = signToken(fixture.drivers[0].user, config);

    const rideRes = await createStandardRide(paxToken);
    const firstOffer = rideRes.body.currentOffer;

    await pool.query(
      `UPDATE offers SET expires_at = now() - interval '5 seconds' WHERE id = $1`,
      [firstOffer.id]
    );
    await expireStaleOffers({ pool, config });

    const beforeDetail = await request(app)
      .get(`/api/v1/rides/${rideRes.body.id}`)
      .set('Authorization', `Bearer ${paxToken}`);

    const lateRes = await request(app)
      .post(`/api/v1/offers/${firstOffer.id}/respond`)
      .set('Authorization', `Bearer ${d1Token}`)
      .send({ action: 'accept' });
    expect(lateRes.status).toBe(409);

    const afterDetail = await request(app)
      .get(`/api/v1/rides/${rideRes.body.id}`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(afterDetail.body.status).toBe(beforeDetail.body.status);
    expect(afterDetail.body.currentOffer.id).toBe(beforeDetail.body.currentOffer.id);

    const eventsRes = await request(app)
      .get(`/api/v1/rides/${rideRes.body.id}/events`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(eventsRes.body.events.map((e) => e.eventType)).toContain(
      'LATE_RESPONSE_REJECTED'
    );
  });

  it('8. concurrent accept vs expire leaves exactly one winner and consistent ride state', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);
    const d1Token = signToken(fixture.drivers[0].user, config);

    const rideRes = await createStandardRide(paxToken);
    const firstOffer = rideRes.body.currentOffer;

    await pool.query(
      `UPDATE offers SET expires_at = now() - interval '1 millisecond' WHERE id = $1`,
      [firstOffer.id]
    );

    const [acceptRes, expireRes] = await Promise.all([
      request(app)
        .post(`/api/v1/offers/${firstOffer.id}/respond`)
        .set('Authorization', `Bearer ${d1Token}`)
        .send({ action: 'accept' }),
      expireStaleOffers({ pool, config }),
    ]);

    const offerRow = await pool.query('SELECT status FROM offers WHERE id = $1', [
      firstOffer.id,
    ]);
    const rideDetail = await request(app)
      .get(`/api/v1/rides/${rideRes.body.id}`)
      .set('Authorization', `Bearer ${paxToken}`);

    if (acceptRes.status === 200) {
      expect(offerRow.rows[0].status).toBe('ACCEPTED');
      expect(rideDetail.body.status).toBe('ACCEPTED');
      expect(expireRes.expiredCount).toBe(0);
    } else {
      expect(acceptRes.status).toBe(409);
      expect(offerRow.rows[0].status).toBe('EXPIRED');
      expect(rideDetail.body.status).toBe('DRIVER_OFFERED');
      expect(rideDetail.body.currentOffer.driverId).toBe(fixture.drivers[1].driver.id);
    }
  });

  it('9. max attempts reached after three rejections makes ride UNFULFILLED and creates passenger notification', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);

    const rideRes = await createStandardRide(paxToken);
    const rideId = rideRes.body.id;

    for (let i = 0; i < 3; i += 1) {
      const detail = await request(app)
        .get(`/api/v1/rides/${rideId}`)
        .set('Authorization', `Bearer ${paxToken}`);
      const offer = detail.body.currentOffer;
      expect(offer).toBeTruthy();
      const offeredDriver = fixture.drivers.find(
        (d) => d.driver.id === offer.driverId
      );
      const drvToken = signToken(offeredDriver.user, config);
      const rej = await request(app)
        .post(`/api/v1/offers/${offer.id}/respond`)
        .set('Authorization', `Bearer ${drvToken}`)
        .send({ action: 'reject' });
      expect(rej.status).toBe(200);
    }

    const finalDetail = await request(app)
      .get(`/api/v1/rides/${rideId}`)
      .set('Authorization', `Bearer ${paxToken}`);
    expect(finalDetail.body.status).toBe('UNFULFILLED');
    expect(finalDetail.body.attemptCount).toBe(3);

    await flushSubscribers();

    const notifRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${paxToken}`);
    expect(notifRes.status).toBe(200);
    expect(
      notifRes.body.notifications.some(
        (n) => n.ride_id === rideId && n.message.includes('No driver available')
      )
    ).toBe(true);
  });

  it('10. no eligible drivers (all OFFLINE) results in UNFULFILLED immediately', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);

    await pool.query("UPDATE drivers SET status = 'OFFLINE'");

    const rideRes = await createStandardRide(paxToken);
    expect(rideRes.status).toBe(201);
    expect(rideRes.body.status).toBe('UNFULFILLED');
    expect(rideRes.body.currentOffer).toBeNull();
  });

  it('11. enforces single PENDING offer per ride and idempotent double-accept for same driver', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);
    const d1Token = signToken(fixture.drivers[0].user, config);

    const rideRes = await createStandardRide(paxToken);
    const offerId = rideRes.body.currentOffer.id;

    // DB constraint rejects second PENDING offer on same ride
    await expect(
      pool.query(
        `INSERT INTO offers (ride_id, driver_id, status, expires_at)
         VALUES ($1, $2, 'PENDING', now() + interval '10 seconds')`,
        [rideRes.body.id, fixture.drivers[1].driver.id]
      )
    ).rejects.toThrow();

    const firstAccept = await request(app)
      .post(`/api/v1/offers/${offerId}/respond`)
      .set('Authorization', `Bearer ${d1Token}`)
      .send({ action: 'accept' });
    expect(firstAccept.status).toBe(200);
    expect(firstAccept.body.idempotent).toBe(false);

    const secondAccept = await request(app)
      .post(`/api/v1/offers/${offerId}/respond`)
      .set('Authorization', `Bearer ${d1Token}`)
      .send({ action: 'accept' });
    expect(secondAccept.status).toBe(200);
    expect(secondAccept.body.idempotent).toBe(true);
  });

  it('12. Idempotency-Key on POST /rides replays the same ride without duplicating', async () => {
    const fixture = await seedFourDriverFixture(pool, config);
    const paxToken = signToken(fixture.passenger, config);

    const payload = {
      pickup: { lat: config.CITY_CENTER_LAT, lng: config.CITY_CENTER_LNG },
      drop: {
        lat: config.CITY_CENTER_LAT + 0.02,
        lng: config.CITY_CENTER_LNG + 0.02,
      },
      pickupLabel: 'Gate 1',
      dropLabel: 'Station',
    };

    const first = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${paxToken}`)
      .set('Idempotency-Key', 'idem-ride-001')
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/rides')
      .set('Authorization', `Bearer ${paxToken}`)
      .set('Idempotency-Key', 'idem-ride-001')
      .send(payload);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const countRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM rides');
    expect(countRes.rows[0].cnt).toBe(1);
  });
});
