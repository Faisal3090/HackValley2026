import crypto from 'node:crypto';
import defaultConfig from '../config/index.js';
import defaultPool from '../db/pool.js';
import { withTransaction } from '../db/tx.js';
import { AppError } from '../middleware/errors.js';
import { rankWithFallback } from '../rankers/index.js';
import { getEligibleCandidates } from './eligibility.js';
import { publishAfterCommit, recordEvent } from './events.js';
import { markUnfulfilled, recoverRide } from './recovery.js';
import { getZoneIntelligence } from './zoneIntelligence.js';

export async function createOffer(
  rideId,
  { client = null, events = null, config = defaultConfig, pool = defaultPool } = {}
) {
  const runInTx = async (txClient, txEvents) => {
    const rideRes = await txClient.query(
      'SELECT * FROM rides WHERE id = $1 FOR UPDATE',
      [rideId]
    );
    if (rideRes.rows.length === 0) return null;

    const ride = rideRes.rows[0];
    if (ride.status !== 'REQUESTED' && ride.status !== 'DRIVER_OFFERED') {
      return { skipped: true, rideStatus: ride.status, offer: null };
    }

    const pendingRes = await txClient.query(
      `SELECT id FROM offers WHERE ride_id = $1 AND status = 'PENDING'`,
      [ride.id]
    );
    if (pendingRes.rows.length > 0) {
      return { skipped: true, rideStatus: ride.status, offer: pendingRes.rows[0] };
    }

    const candidates = await getEligibleCandidates(ride, {
      client: txClient,
      pool,
      config,
    });
    const zone = await getZoneIntelligence(ride.pickup_lat, ride.pickup_lng);
    const { ranked, rankerUsed, fellBack } = rankWithFallback({
      ride,
      candidates,
      zone,
      config,
      now: new Date(),
    });

    const decisionId = `DEC-${crypto.randomUUID().slice(0, 8)}`;
    const rankingPayload = ranked.map((entry, idx) => ({
      rank: idx + 1,
      driverId: entry.driver.id,
      name: entry.driver.name,
      lat: entry.driver.lat,
      lng: entry.driver.lng,
      vehicleType: entry.driver.vehicleType,
      distanceKm: entry.distanceKm,
      etaMin: entry.etaMin,
      score: entry.score,
      factors: entry.factors,
      reason: entry.reason,
      selected: idx === 0,
    }));

    txEvents.push(
      await recordEvent(txClient, {
        eventType: 'DRIVER_RANKED',
        rideId: ride.id,
        payload: {
          decisionId,
          rankerUsed,
          fellBack,
          attempt: ride.attempt_count + 1,
          rankedDrivers: rankingPayload,
        },
      })
    );

    if (ranked.length === 0) {
      await markUnfulfilled(txClient, ride, 'no_eligible_drivers', txEvents);
      return { rideStatus: 'UNFULFILLED', offer: null };
    }

    const top = ranked[0];
    const offerRes = await txClient.query(
      `INSERT INTO offers (
         ride_id, driver_id, status, expires_at, rank_position, score, decision_id
       )
       VALUES (
         $1, $2, 'PENDING', now() + ($3 || ' seconds')::interval, 1, $4, $5
       )
       RETURNING *`,
      [
        ride.id,
        top.driver.id,
        String(config.OFFER_TIMEOUT_SECONDS),
        top.score,
        decisionId,
      ]
    );
    const offer = offerRes.rows[0];

    await txClient.query(
      `UPDATE drivers
       SET offers_received = offers_received + 1
       WHERE id = $1`,
      [top.driver.id]
    );

    const updatedRideRes = await txClient.query(
      `UPDATE rides
       SET status = 'DRIVER_OFFERED',
           attempt_count = attempt_count + 1,
           estimated_pickup_eta_min = COALESCE(estimated_pickup_eta_min, $2),
           version = version + 1
       WHERE id = $1
       RETURNING *`,
      [ride.id, top.etaMin]
    );
    const updatedRide = updatedRideRes.rows[0];

    txEvents.push(
      await recordEvent(txClient, {
        eventType: 'DRIVER_OFFERED',
        rideId: ride.id,
        driverId: top.driver.id,
        offerId: offer.id,
        payload: {
          driverName: top.driver.name,
          attempt: updatedRide.attempt_count,
          expiresAt: offer.expires_at,
          score: top.score,
          reason: top.reason,
          decisionId,
        },
      })
    );

    if (ride.status !== 'DRIVER_OFFERED') {
      txEvents.push(
        await recordEvent(txClient, {
          eventType: 'RIDE_STATUS_CHANGED',
          rideId: ride.id,
          driverId: top.driver.id,
          offerId: offer.id,
          payload: {
            from: ride.status,
            to: 'DRIVER_OFFERED',
          },
        })
      );
    }

    return { rideStatus: 'DRIVER_OFFERED', offer, ride: updatedRide };
  };

  if (client) {
    return runInTx(client, events || []);
  }

  const collectedEvents = [];
  const result = await withTransaction(
    (txClient) => runInTx(txClient, collectedEvents),
    pool
  );
  publishAfterCommit(collectedEvents);
  return result;
}

export async function respondToOffer(
  offerId,
  action,
  user,
  { pool = defaultPool, config = defaultConfig } = {}
) {
  const preRes = await pool.query(
    `SELECT o.*, d.user_id AS driver_user_id, u.name AS driver_name
     FROM offers o
     JOIN drivers d ON d.id = o.driver_id
     JOIN users u ON u.id = d.user_id
     WHERE o.id = $1`,
    [offerId]
  );
  if (preRes.rows.length === 0) {
    throw new AppError(404, 'OFFER_NOT_FOUND', 'Offer not found');
  }

  const offerMeta = preRes.rows[0];
  if (
    !config.DEMO_MODE &&
    user.role !== 'admin' &&
    offerMeta.driver_user_id !== user.id
  ) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Cannot respond to an offer assigned to another driver'
    );
  }

  const events = [];
  let conflictError = null;

  const outcome = await withTransaction(async (client) => {
    if (action === 'accept') {
      const updOffer = await client.query(
        `UPDATE offers
         SET status = 'ACCEPTED',
             responded_at = now(),
             version = version + 1
         WHERE id = $1 AND status = 'PENDING' AND expires_at > now()
         RETURNING *`,
        [offerId]
      );

      if (updOffer.rowCount === 0) {
        const curRes = await client.query('SELECT * FROM offers WHERE id = $1', [
          offerId,
        ]);
        const curOffer = curRes.rows[0];
        if (
          curOffer.status === 'ACCEPTED' &&
          (config.DEMO_MODE ||
            user.role === 'admin' ||
            offerMeta.driver_user_id === user.id)
        ) {
          const rideRes = await client.query('SELECT * FROM rides WHERE id = $1', [
            curOffer.ride_id,
          ]);
          return {
            idempotent: true,
            offer: curOffer,
            ride: rideRes.rows[0],
          };
        }

        events.push(
          await recordEvent(client, {
            eventType: 'LATE_RESPONSE_REJECTED',
            rideId: curOffer.ride_id,
            driverId: curOffer.driver_id,
            offerId: curOffer.id,
            payload: {
              action: 'accept',
              currentOfferStatus: curOffer.status,
              expiresAt: curOffer.expires_at,
            },
          })
        );
        conflictError = new AppError(
          409,
          'OFFER_EXPIRED_OR_CLOSED',
          `Cannot accept offer in status ${curOffer.status}`
        );
        return null;
      }

      const acceptedOffer = updOffer.rows[0];

      const updRide = await client.query(
        `UPDATE rides
         SET status = 'ACCEPTED',
             current_driver_id = $2,
             accepted_at = now(),
             version = version + 1
         WHERE id = $1 AND status = 'DRIVER_OFFERED'
         RETURNING *`,
        [acceptedOffer.ride_id, acceptedOffer.driver_id]
      );

      if (updRide.rowCount === 0) {
        throw new AppError(
          409,
          'RIDE_STATE_CONFLICT',
          'Ride is no longer awaiting driver acceptance'
        );
      }

      const updDriver = await client.query(
        `UPDATE drivers
         SET status = 'BUSY'
         WHERE id = $1 AND status = 'AVAILABLE'
         RETURNING *`,
        [acceptedOffer.driver_id]
      );
      if (updDriver.rowCount === 0) {
        throw new AppError(
          409,
          'DRIVER_UNAVAILABLE',
          'Driver is no longer available'
        );
      }

      const acceptedRide = updRide.rows[0];

      events.push(
        await recordEvent(client, {
          eventType: 'DRIVER_ACCEPTED',
          rideId: acceptedRide.id,
          driverId: acceptedOffer.driver_id,
          offerId: acceptedOffer.id,
          payload: { driverName: offerMeta.driver_name },
        })
      );
      events.push(
        await recordEvent(client, {
          eventType: 'DRIVER_ASSIGNED',
          rideId: acceptedRide.id,
          driverId: acceptedOffer.driver_id,
          offerId: acceptedOffer.id,
          payload: { driverName: offerMeta.driver_name },
        })
      );
      events.push(
        await recordEvent(client, {
          eventType: 'RIDE_STATUS_CHANGED',
          rideId: acceptedRide.id,
          driverId: acceptedOffer.driver_id,
          offerId: acceptedOffer.id,
          payload: { from: 'DRIVER_OFFERED', to: 'ACCEPTED' },
        })
      );

      return {
        idempotent: false,
        offer: acceptedOffer,
        ride: acceptedRide,
      };
    }

    // Reject flow
    const updOffer = await client.query(
      `UPDATE offers
       SET status = 'REJECTED',
           responded_at = now(),
           version = version + 1
       WHERE id = $1 AND status = 'PENDING' AND expires_at > now()
       RETURNING *`,
      [offerId]
    );

    if (updOffer.rowCount === 0) {
      const curRes = await client.query('SELECT * FROM offers WHERE id = $1', [
        offerId,
      ]);
      const curOffer = curRes.rows[0];
      if (
        curOffer.status === 'REJECTED' &&
        (config.DEMO_MODE ||
          user.role === 'admin' ||
          offerMeta.driver_user_id === user.id)
      ) {
        return { idempotent: true, offer: curOffer };
      }

      events.push(
        await recordEvent(client, {
          eventType: 'LATE_RESPONSE_REJECTED',
          rideId: curOffer.ride_id,
          driverId: curOffer.driver_id,
          offerId: curOffer.id,
          payload: {
            action: 'reject',
            currentOfferStatus: curOffer.status,
            expiresAt: curOffer.expires_at,
          },
        })
      );
      conflictError = new AppError(
        409,
        'OFFER_EXPIRED_OR_CLOSED',
        `Cannot reject offer in status ${curOffer.status}`
      );
      return null;
    }

    const rejectedOffer = updOffer.rows[0];
    events.push(
      await recordEvent(client, {
        eventType: 'DRIVER_REJECTED',
        rideId: rejectedOffer.ride_id,
        driverId: rejectedOffer.driver_id,
        offerId: rejectedOffer.id,
        payload: { driverName: offerMeta.driver_name },
      })
    );

    const recovery = await recoverRide(
      rejectedOffer.ride_id,
      'driver_rejected',
      { client, events, config, pool }
    );

    return {
      idempotent: false,
      offer: rejectedOffer,
      recovery,
    };
  }, pool);

  publishAfterCommit(events);

  if (conflictError) {
    throw conflictError;
  }

  return outcome;
}

export async function expireStaleOffers({
  pool = defaultPool,
  config = defaultConfig,
} = {}) {
  let expiredCount = 0;

  while (true) {
    const events = [];
    const didExpire = await withTransaction(async (client) => {
      const staleRes = await client.query(
        `SELECT * FROM offers
         WHERE status = 'PENDING' AND expires_at <= now()
         ORDER BY expires_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );
      if (staleRes.rows.length === 0) return false;

      const stale = staleRes.rows[0];
      const updRes = await client.query(
        `UPDATE offers
         SET status = 'EXPIRED',
             responded_at = now(),
             version = version + 1
         WHERE id = $1 AND status = 'PENDING'
         RETURNING *`,
        [stale.id]
      );
      if (updRes.rowCount === 0) return false;

      events.push(
        await recordEvent(client, {
          eventType: 'OFFER_EXPIRED',
          rideId: stale.ride_id,
          driverId: stale.driver_id,
          offerId: stale.id,
          payload: { expiresAt: stale.expires_at },
        })
      );

      await recoverRide(stale.ride_id, 'offer_timeout', {
        client,
        events,
        config,
        pool,
      });

      return true;
    }, pool);

    if (!didExpire) break;

    publishAfterCommit(events);
    expiredCount += 1;
  }

  return { expiredCount };
}
