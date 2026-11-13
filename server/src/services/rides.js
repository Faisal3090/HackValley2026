import defaultConfig from '../config/index.js';
import defaultPool from '../db/pool.js';
import { withTransaction } from '../db/tx.js';
import { AppError } from '../middleware/errors.js';
import { publishAfterCommit, recordEvent, toEventEnvelope } from './events.js';
import { calculateFare } from './fare.js';
import { createOffer } from './offers.js';
import { getRoute } from './routing.js';
import { getZoneIntelligence } from './zoneIntelligence.js';

export const TRANSITIONS = {
  REQUESTED: ['DRIVER_OFFERED', 'UNFULFILLED', 'CANCELLED'],
  DRIVER_OFFERED: ['DRIVER_OFFERED', 'ACCEPTED', 'UNFULFILLED', 'CANCELLED'],
  ACCEPTED: ['ARRIVING', 'CANCELLED'],
  ARRIVING: ['ONGOING'],
  ONGOING: ['COMPLETED'],
  COMPLETED: [],
  UNFULFILLED: [],
  CANCELLED: [],
};

export const DRIVER_PROGRESS_NEXT = {
  ACCEPTED: { to: 'ARRIVING', timestampCol: 'arriving_at' },
  ARRIVING: { to: 'ONGOING', timestampCol: 'started_at' },
  ONGOING: { to: 'COMPLETED', timestampCol: 'completed_at' },
};

export async function createRide(
  {
    passengerId,
    pickup,
    drop,
    pickupLabel = '',
    dropLabel = '',
    vehicleType = null,
  },
  { pool = defaultPool, config = defaultConfig } = {}
) {
  const [route, zone] = await Promise.all([
    getRoute(pickup, drop, { config }),
    getZoneIntelligence(pickup.lat, pickup.lng),
  ]);

  const fare = calculateFare({
    tripDistanceKm: route.distanceKm,
    vehicleType: vehicleType || 'HATCHBACK',
    zone,
    cfg: config,
  });

  const events = [];
  let createdRide;

  try {
    createdRide = await withTransaction(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO rides (
           passenger_id,
           pickup_lat, pickup_lng, pickup_label,
           drop_lat, drop_lng, drop_label,
           vehicle_type, status,
           trip_distance_km, trip_duration_min,
           estimated_fare, fare_breakdown, zone_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'REQUESTED', $9, $10, $11, $12::jsonb, $13)
         RETURNING *`,
        [
          passengerId,
          pickup.lat,
          pickup.lng,
          pickupLabel,
          drop.lat,
          drop.lng,
          dropLabel,
          vehicleType || null,
          route.distanceKm,
          route.durationMin,
          fare.total,
          JSON.stringify(fare.breakdown),
          zone.zoneId,
        ]
      );
      const ride = insertRes.rows[0];

      events.push(
        await recordEvent(client, {
          eventType: 'RIDE_REQUESTED',
          rideId: ride.id,
          payload: {
            pickup: { lat: pickup.lat, lng: pickup.lng, label: pickupLabel },
            drop: { lat: drop.lat, lng: drop.lng, label: dropLabel },
            vehicleType: vehicleType || null,
            estimatedFare: fare.total,
            routeSource: route.source,
          },
        })
      );

      await createOffer(ride.id, { client, events, config, pool });
      return ride;
    }, pool);
  } catch (err) {
    if (err?.code === '23505' && err?.constraint === 'one_active_ride_per_passenger') {
      throw new AppError(
        409,
        'ACTIVE_RIDE_EXISTS',
        'Passenger already has an active ride'
      );
    }
    if (err?.code === '23505') {
      throw new AppError(
        409,
        'ACTIVE_RIDE_EXISTS',
        'Passenger already has an active ride'
      );
    }
    throw err;
  }

  publishAfterCommit(events);
  return getRideDetail(createdRide.id, { pool, config });
}

export async function advanceRide(
  rideId,
  driverUserId,
  { pool = defaultPool, config = defaultConfig } = {}
) {
  const events = [];

  await withTransaction(async (client) => {
    const rideRes = await client.query(
      'SELECT * FROM rides WHERE id = $1 FOR UPDATE',
      [rideId]
    );
    if (rideRes.rows.length === 0) {
      throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found');
    }
    const ride = rideRes.rows[0];

    const drvRes = await client.query(
      'SELECT * FROM drivers WHERE user_id = $1',
      [driverUserId]
    );
    const driver = drvRes.rows[0];

    if (!driver || ride.current_driver_id !== driver.id) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the assigned driver can advance this ride'
      );
    }

    const next = DRIVER_PROGRESS_NEXT[ride.status];
    if (!next || !TRANSITIONS[ride.status]?.includes(next.to)) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        `Cannot advance ride from status ${ride.status}`
      );
    }

    const extraSet = next.to === 'COMPLETED' ? ', final_fare = estimated_fare' : '';
    const updRes = await client.query(
      `UPDATE rides
       SET status = $2,
           ${next.timestampCol} = now(),
           version = version + 1
           ${extraSet}
       WHERE id = $1 AND status = $3 AND current_driver_id = $4
       RETURNING *`,
      [ride.id, next.to, ride.status, driver.id]
    );
    if (updRes.rowCount === 0) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        'Ride state changed concurrently'
      );
    }

    if (next.to === 'COMPLETED') {
      await client.query(
        `UPDATE drivers
         SET status = 'AVAILABLE',
             rides_completed = rides_completed + 1
         WHERE id = $1`,
        [driver.id]
      );
    }

    events.push(
      await recordEvent(client, {
        eventType: 'RIDE_STATUS_CHANGED',
        rideId: ride.id,
        driverId: driver.id,
        payload: {
          from: ride.status,
          to: next.to,
        },
      })
    );
  }, pool);

  publishAfterCommit(events);
  return getRideDetail(rideId, { pool, config });
}

export async function cancelRide(
  rideId,
  passengerId,
  { pool = defaultPool, config = defaultConfig } = {}
) {
  const events = [];

  await withTransaction(async (client) => {
    const rideRes = await client.query(
      'SELECT * FROM rides WHERE id = $1 FOR UPDATE',
      [rideId]
    );
    if (rideRes.rows.length === 0) {
      throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found');
    }
    const ride = rideRes.rows[0];

    if (ride.passenger_id !== passengerId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Cannot cancel another passenger ride'
      );
    }

    if (!TRANSITIONS[ride.status]?.includes('CANCELLED')) {
      throw new AppError(
        409,
        'CANNOT_CANCEL',
        `Ride in status ${ride.status} cannot be cancelled`
      );
    }

    const updRes = await client.query(
      `UPDATE rides
       SET status = 'CANCELLED',
           cancelled_at = now(),
           version = version + 1
       WHERE id = $1 AND status IN ('REQUESTED', 'DRIVER_OFFERED', 'ACCEPTED')
       RETURNING *`,
      [ride.id]
    );
    if (updRes.rowCount === 0) {
      throw new AppError(409, 'CANNOT_CANCEL', 'Ride can no longer be cancelled');
    }

    await client.query(
      `UPDATE offers
       SET status = 'EXPIRED',
           responded_at = now(),
           version = version + 1
       WHERE ride_id = $1 AND status = 'PENDING'`,
      [ride.id]
    );

    if (ride.current_driver_id) {
      await client.query(
        `UPDATE drivers
         SET status = 'AVAILABLE'
         WHERE id = $1 AND status = 'BUSY'`,
        [ride.current_driver_id]
      );
    }

    events.push(
      await recordEvent(client, {
        eventType: 'RIDE_CANCELLED',
        rideId: ride.id,
        driverId: ride.current_driver_id,
        payload: { previousStatus: ride.status },
      })
    );
    events.push(
      await recordEvent(client, {
        eventType: 'RIDE_STATUS_CHANGED',
        rideId: ride.id,
        driverId: ride.current_driver_id,
        payload: { from: ride.status, to: 'CANCELLED' },
      })
    );
  }, pool);

  publishAfterCommit(events);
  return getRideDetail(rideId, { pool, config });
}

export async function getRideDetail(
  rideId,
  { pool = defaultPool, config = defaultConfig } = {}
) {
  const rideRes = await pool.query('SELECT * FROM rides WHERE id = $1', [rideId]);
  if (rideRes.rows.length === 0) return null;
  const ride = rideRes.rows[0];

  let currentDriver = null;
  if (ride.current_driver_id) {
    const drvRes = await pool.query(
      `SELECT d.id, u.name, d.vehicle_type, d.vehicle_number, d.lat, d.lng, u.phone
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [ride.current_driver_id]
    );
    if (drvRes.rows.length > 0) {
      const d = drvRes.rows[0];
      currentDriver = {
        id: d.id,
        name: d.name,
        vehicleType: d.vehicle_type,
        vehicleNumber: d.vehicle_number,
        lat: d.lat,
        lng: d.lng,
        phone: d.phone,
      };
    }
  }

  const offerRes = await pool.query(
    `SELECT o.*, u.name AS driver_name,
            EXTRACT(EPOCH FROM (o.expires_at - now())) AS seconds_left
     FROM offers o
     JOIN drivers d ON d.id = o.driver_id
     JOIN users u ON u.id = d.user_id
     WHERE o.ride_id = $1 AND o.status = 'PENDING'
     ORDER BY o.created_at DESC
     LIMIT 1`,
    [ride.id]
  );

  let currentOffer = null;
  if (offerRes.rows.length > 0) {
    const o = offerRes.rows[0];
    currentOffer = {
      id: o.id,
      driverId: o.driver_id,
      driverName: o.driver_name,
      status: o.status,
      expiresAt: o.expires_at,
      secondsLeft: Math.max(0, Number(Number(o.seconds_left).toFixed(1))),
    };
  }

  const expiredRes = await pool.query(
    `SELECT id FROM offers
     WHERE ride_id = $1 AND status = 'EXPIRED'
     ORDER BY responded_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [ride.id]
  );
  const lastExpiredOfferId = expiredRes.rows[0]?.id ?? null;

  const rankedRes = await pool.query(
    `SELECT payload
     FROM ride_events
     WHERE ride_id = $1 AND event_type = 'DRIVER_RANKED'
     ORDER BY occurred_at DESC, id DESC
     LIMIT 1`,
    [ride.id]
  );
  const latestRankingPayload = rankedRes.rows[0]?.payload ?? null;

  return {
    id: ride.id,
    passengerId: ride.passenger_id,
    status: ride.status,
    attemptCount: ride.attempt_count,
    maxAttempts: config.MAX_ATTEMPTS,
    vehicleType: ride.vehicle_type,
    pickup: {
      lat: ride.pickup_lat,
      lng: ride.pickup_lng,
      label: ride.pickup_label || '',
    },
    drop: {
      lat: ride.drop_lat,
      lng: ride.drop_lng,
      label: ride.drop_label || '',
    },
    tripDistanceKm: ride.trip_distance_km !== null ? Number(ride.trip_distance_km) : null,
    tripDurationMin: ride.trip_duration_min !== null ? Number(ride.trip_duration_min) : null,
    estimatedFare: ride.estimated_fare !== null ? Number(ride.estimated_fare) : null,
    finalFare: ride.final_fare !== null ? Number(ride.final_fare) : null,
    fareBreakdown: ride.fare_breakdown ?? {},
    estimatedPickupEtaMin:
      ride.estimated_pickup_eta_min !== null
        ? Number(ride.estimated_pickup_eta_min)
        : null,
    currentDriver,
    currentOffer,
    latestRanking: latestRankingPayload?.rankedDrivers ?? [],
    rankerUsed: latestRankingPayload?.rankerUsed ?? null,
    fellBack: latestRankingPayload?.fellBack ?? false,
    lastExpiredOfferId,
    timestamps: {
      createdAt: ride.created_at,
      acceptedAt: ride.accepted_at,
      arrivingAt: ride.arriving_at,
      startedAt: ride.started_at,
      completedAt: ride.completed_at,
      cancelledAt: ride.cancelled_at,
    },
  };
}

export async function getRideEvents(rideId, { pool = defaultPool } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM ride_events
     WHERE ride_id = $1
     ORDER BY occurred_at ASC, id ASC`,
    [rideId]
  );
  return rows.map(toEventEnvelope);
}

export async function getRideHistory(user, { pool = defaultPool } = {}) {
  let where = '';
  const params = [];

  if (user.role === 'passenger') {
    params.push(user.id);
    where = 'WHERE r.passenger_id = $1';
  } else if (user.role === 'driver') {
    params.push(user.id);
    where = 'WHERE d.user_id = $1';
  }

  const { rows } = await pool.query(
    `SELECT r.id, r.status,
            r.pickup_label, r.drop_label,
            r.pickup_lat, r.pickup_lng, r.drop_lat, r.drop_lng,
            r.vehicle_type, r.trip_distance_km,
            r.estimated_fare, r.final_fare,
            r.created_at, r.completed_at,
            pu.name AS passenger_name,
            du.name AS driver_name
     FROM rides r
     JOIN users pu ON pu.id = r.passenger_id
     LEFT JOIN drivers d ON d.id = r.current_driver_id
     LEFT JOIN users du ON du.id = d.user_id
     ${where}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT 100`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    pickupLabel: row.pickup_label || '',
    dropLabel: row.drop_label || '',
    pickupLat: row.pickup_lat,
    pickupLng: row.pickup_lng,
    dropLat: row.drop_lat,
    dropLng: row.drop_lng,
    vehicleType: row.vehicle_type,
    tripDistanceKm:
      row.trip_distance_km !== null ? Number(row.trip_distance_km) : null,
    estimatedFare:
      row.estimated_fare !== null ? Number(row.estimated_fare) : null,
    finalFare: row.final_fare !== null ? Number(row.final_fare) : null,
    driverName: row.driver_name ?? null,
    passengerName: row.passenger_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

export async function canViewRide(ride, user, { pool = defaultPool, config = defaultConfig } = {}) {
  if (config.DEMO_MODE) return true;
  if (user.role === 'admin') return true;
  const passengerId = ride.passenger_id ?? ride.passengerId;
  if (passengerId === user.id) return true;
  if (user.role === 'driver') {
    const drvRes = await pool.query(
      'SELECT id FROM drivers WHERE user_id = $1',
      [user.id]
    );
    const driverId = drvRes.rows[0]?.id;
    if (!driverId) return false;
    const currentDriverId = ride.current_driver_id ?? ride.currentDriver?.id;
    if (currentDriverId === driverId) return true;
    const offerRes = await pool.query(
      'SELECT 1 FROM offers WHERE ride_id = $1 AND driver_id = $2 LIMIT 1',
      [ride.id, driverId]
    );
    return offerRes.rows.length > 0;
  }
  return false;
}
