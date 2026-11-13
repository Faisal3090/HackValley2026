import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errors.js';
import { createRequireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { haversineKm } from '../services/geo.js';
import { getEtaMatrix } from '../services/routing.js';
import { estimateEarnings } from '../services/earnings.js';

const costSettingsSchema = z.object({
  fuelCostPerKm: z.number().finite().min(0).max(1000),
  maintenanceCostPerKm: z.number().finite().min(0).max(1000),
  base: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
});

const availabilitySchema = z.object({
  available: z.boolean(),
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const emptyToUndefined = (val) => (val === '' ? undefined : val);

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().max(50).optional()
  ),
  vehicleType: z.preprocess(
    emptyToUndefined,
    z.enum(['AUTO', 'HATCHBACK', 'SEDAN', 'SUV']).optional()
  ),
});

function formatDriver(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    vehicleType: row.vehicle_type,
    vehicleNumber: row.vehicle_number,
    licenseNumber: row.license_number || null,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    onlineSince: row.online_since,
    lastHeartbeat: row.last_heartbeat,
    offersReceived: row.offers_received,
    ridesCompleted: row.rides_completed,
    acceptRate: Number(row.accept_rate),
  };
}

export function createDriversRouter({ pool, config }) {
  const router = Router();
  const requireAuth = createRequireAuth({ pool, cfg: config });

  router.get('/me/cost-settings', requireAuth, requireRole('driver'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT fuel_cost_per_km, maintenance_cost_per_km, base_lat, base_lng FROM drivers WHERE user_id = $1', [req.user.id]);
    const d = rows[0];
    if (!d) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    res.json({ fuelCostPerKm: d.fuel_cost_per_km == null ? null : Number(d.fuel_cost_per_km),
      maintenanceCostPerKm: d.maintenance_cost_per_km == null ? null : Number(d.maintenance_cost_per_km),
      base: d.base_lat == null ? null : { lat: d.base_lat, lng: d.base_lng },
      commissionPercent: Number(((1 - config.DRIVER_PAYOUT_PERCENT) * 100).toFixed(2)),
    });
  }));

  router.put('/me/cost-settings', requireAuth, requireRole('driver'), validateBody(costSettingsSchema), asyncHandler(async (req, res) => {
    const { fuelCostPerKm, maintenanceCostPerKm, base } = req.body;
    const result = await pool.query(`UPDATE drivers SET fuel_cost_per_km = $1, maintenance_cost_per_km = $2, base_lat = $3, base_lng = $4 WHERE user_id = $5 RETURNING id`,
      [fuelCostPerKm, maintenanceCostPerKm, base?.lat ?? null, base?.lng ?? null, req.user.id]);
    if (!result.rows.length) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    res.json({ saved: true });
  }));

  router.post(
    '/me/availability',
    requireAuth,
    requireRole('driver'),
    validateBody(availabilitySchema),
    asyncHandler(async (req, res) => {
      const { available } = req.body;
      const sql = available
        ? `UPDATE drivers
           SET status = 'AVAILABLE',
               online_since = COALESCE(online_since, now()),
               last_heartbeat = now()
           WHERE user_id = $1 AND status <> 'BUSY'
           RETURNING *`
        : `UPDATE drivers
           SET status = 'OFFLINE',
               online_since = NULL
           WHERE user_id = $1 AND status <> 'BUSY'
           RETURNING *`;

      const { rows } = await pool.query(sql, [req.user.id]);
      if (rows.length === 0) {
        const current = await pool.query(
          'SELECT status FROM drivers WHERE user_id = $1',
          [req.user.id]
        );
        if (current.rows.length === 0) {
          throw new AppError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
        }
        throw new AppError(
          409,
          'DRIVER_BUSY',
          'Cannot change availability while assigned to an active ride'
        );
      }

      res.json({
        driver: formatDriver({ ...rows[0], name: req.user.name }),
      });
    })
  );

  router.post(
    '/me/location',
    requireAuth,
    requireRole('driver'),
    validateBody(locationSchema),
    asyncHandler(async (req, res) => {
      const { lat, lng } = req.body;
      const { rows } = await pool.query(
        `UPDATE drivers
         SET lat = $1, lng = $2, last_heartbeat = now()
         WHERE user_id = $3
         RETURNING *`,
        [lat, lng, req.user.id]
      );
      if (rows.length === 0) {
        throw new AppError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
      }
      res.json({
        driver: formatDriver({ ...rows[0], name: req.user.name }),
      });
    })
  );

  router.get(
    '/me',
    requireAuth,
    requireRole('driver'),
    asyncHandler(async (req, res) => {
      await pool.query(
        `UPDATE drivers SET last_heartbeat = now()
         WHERE user_id = $1 AND status IN ('AVAILABLE', 'BUSY')`,
        [req.user.id]
      );
      const { rows } = await pool.query(
        `SELECT d.*, u.name
         FROM drivers d
         JOIN users u ON u.id = d.user_id
         WHERE d.user_id = $1`,
        [req.user.id]
      );
      if (rows.length === 0) {
        throw new AppError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
      }
      res.json({ driver: formatDriver(rows[0]) });
    })
  );

  router.get(
    '/me/offer',
    requireAuth,
    requireRole('driver'),
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT o.id, o.ride_id, o.driver_id, o.status, o.expires_at, o.score, o.decision_id,
                EXTRACT(EPOCH FROM (o.expires_at - now())) AS seconds_left,
                r.pickup_lat, r.pickup_lng, r.pickup_label,
                r.drop_lat, r.drop_lng, r.drop_label,
                r.trip_distance_km, r.trip_duration_min, r.estimated_fare,
                r.vehicle_type, pu.name AS passenger_name
         FROM offers o
         JOIN drivers d ON d.id = o.driver_id
         JOIN rides r ON r.id = o.ride_id
         JOIN users pu ON pu.id = r.passenger_id
         WHERE d.user_id = $1
           AND o.status = 'PENDING'
           AND o.expires_at > now()
         ORDER BY o.created_at DESC
         LIMIT 1`,
        [req.user.id]
      );

      if (rows.length === 0) {
        return res.json({ offer: null });
      }

      const o = rows[0];
      const driverResult = await pool.query('SELECT * FROM drivers WHERE id = $1', [o.driver_id]);
      const earnings = await estimateEarnings(o, driverResult.rows[0], config);
      return res.json({
        offer: {
          earnings,
          id: o.id,
          rideId: o.ride_id,
          driverId: o.driver_id,
          status: o.status,
          expiresAt: o.expires_at,
          secondsLeft: Math.max(0, Number(Number(o.seconds_left).toFixed(1))),
          score: o.score !== null ? Number(o.score) : null,
          decisionId: o.decision_id,
          pickup: {
            lat: o.pickup_lat,
            lng: o.pickup_lng,
            label: o.pickup_label || '',
          },
          drop: {
            lat: o.drop_lat,
            lng: o.drop_lng,
            label: o.drop_label || '',
          },
          tripDistanceKm:
            o.trip_distance_km !== null ? Number(o.trip_distance_km) : null,
          tripDurationMin:
            o.trip_duration_min !== null ? Number(o.trip_duration_min) : null,
          estimatedFare:
            o.estimated_fare !== null ? Number(o.estimated_fare) : null,
          vehicleType: o.vehicle_type,
          passengerName: o.passenger_name,
        },
      });
    })
  );

  router.get(
    '/me/active-ride',
    requireAuth,
    requireRole('driver'),
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT r.id, r.earnings_snapshot
         FROM rides r
         JOIN drivers d ON d.id = r.current_driver_id
         WHERE d.user_id = $1
           AND r.status IN ('ACCEPTED', 'ARRIVING', 'ONGOING')
         ORDER BY r.created_at DESC
         LIMIT 1`,
        [req.user.id]
      );

      if (rows.length === 0) {
        return res.json({ ride: null });
      }

      const { getRideDetail } = await import('../services/rides.js');
      const ride = await getRideDetail(rows[0].id, { pool, config });
      ride.earnings = rows[0].earnings_snapshot;
      return res.json({ ride });
    })
  );

  router.get(
    '/nearby',
    requireAuth,
    requireRole('passenger'),
    validateQuery(nearbyQuerySchema),
    asyncHandler(async (req, res) => {
      const { lat, lng, radiusKm: queryRadius, vehicleType } = req.validatedQuery;
      const radiusKm = queryRadius ?? config.SEARCH_RADIUS_KM;

      const params = [];
      let where = `d.status = 'AVAILABLE' AND d.lat IS NOT NULL AND d.lng IS NOT NULL`;
      if (vehicleType) {
        params.push(vehicleType);
        where += ` AND d.vehicle_type = $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT d.id, u.name, d.lat, d.lng, d.vehicle_type
         FROM drivers d
         JOIN users u ON u.id = d.user_id
         WHERE ${where}`,
        params
      );

      const withinRadius = rows.filter(
        (d) => haversineKm({ lat, lng }, { lat: d.lat, lng: d.lng }) <= radiusKm
      );

      const matrix = await getEtaMatrix(withinRadius, { lat, lng }, { config });

      const drivers = withinRadius
        .map((d) => {
          const metrics = matrix[d.id];
          return {
            id: d.id,
            name: d.name,
            lat: d.lat,
            lng: d.lng,
            vehicleType: d.vehicle_type,
            distanceKm: metrics.distanceKm,
            etaMin: metrics.etaMin,
            source: metrics.source,
          };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm || a.etaMin - b.etaMin || a.id - b.id);

      const routeSource = drivers.length > 0 ? drivers[0].source : config.ROUTING_PROVIDER;
      res.json({
        drivers,
        radiusKm,
        source: routeSource,
      });
    })
  );

  router.get(
    '/live',
    requireAuth,
    asyncHandler(async (req, res) => {
      const canViewFleet = config.DEMO_MODE || req.user.role === 'admin';

      let vehicleRows = [];
      if (canViewFleet) {
        const result = await pool.query(
          `SELECT d.id, d.user_id, u.name, d.vehicle_type, d.vehicle_number,
                  d.lat, d.lng, d.status, d.online_since, d.last_heartbeat,
                  d.offers_received, d.rides_completed, d.accept_rate
           FROM drivers d
           JOIN users u ON u.id = d.user_id
           ORDER BY d.id ASC`
        );
        vehicleRows = result.rows;
      } else if (req.user.role === 'driver') {
        const result = await pool.query(
          `SELECT d.id, d.user_id, u.name, d.vehicle_type, d.vehicle_number,
                  d.lat, d.lng, d.status, d.online_since, d.last_heartbeat,
                  d.offers_received, d.rides_completed, d.accept_rate
           FROM drivers d
           JOIN users u ON u.id = d.user_id
           WHERE d.user_id = $1`,
          [req.user.id]
        );
        vehicleRows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT d.id, d.user_id, u.name, d.vehicle_type, d.vehicle_number,
                  d.lat, d.lng, d.status, d.online_since, d.last_heartbeat,
                  d.offers_received, d.rides_completed, d.accept_rate
           FROM drivers d
           JOIN users u ON u.id = d.user_id
           WHERE d.status = 'AVAILABLE'
              OR d.id IN (
                SELECT r.current_driver_id
                FROM rides r
                WHERE r.passenger_id = $1
                  AND r.status IN ('ACCEPTED', 'ARRIVING', 'ONGOING')
                  AND r.current_driver_id IS NOT NULL
              )
           ORDER BY d.id ASC`,
          [req.user.id]
        );
        vehicleRows = result.rows;
      }

      const activeRideConditions = canViewFleet
        ? `r.status IN ('REQUESTED', 'DRIVER_OFFERED', 'ACCEPTED', 'ARRIVING', 'ONGOING')`
        : req.user.role === 'driver'
        ? `r.status IN ('ACCEPTED', 'ARRIVING', 'ONGOING') AND d_cur.user_id = $1`
        : `r.status IN ('REQUESTED', 'DRIVER_OFFERED', 'ACCEPTED', 'ARRIVING', 'ONGOING') AND r.passenger_id = $1`;

      const activeRideParams = canViewFleet ? [] : [req.user.id];
      const activeRidesRes = await pool.query(
        `SELECT r.id, r.status, r.vehicle_type, r.attempt_count, r.estimated_fare,
                r.estimated_pickup_eta_min, r.trip_distance_km,
                r.pickup_lat, r.pickup_lng, r.pickup_label,
                r.drop_lat, r.drop_lng, r.drop_label,
                r.current_driver_id, r.created_at,
                pu.name AS passenger_name,
                po.id AS pending_offer_id,
                po.driver_id AS offered_driver_id,
                EXTRACT(EPOCH FROM (po.expires_at - now())) AS offer_seconds_left
         FROM rides r
         JOIN users pu ON pu.id = r.passenger_id
         LEFT JOIN drivers d_cur ON d_cur.id = r.current_driver_id
         LEFT JOIN offers po ON po.ride_id = r.id AND po.status = 'PENDING'
         WHERE ${activeRideConditions}
         ORDER BY r.created_at DESC, r.id DESC`,
        activeRideParams
      );

      const activeRides = activeRidesRes.rows.map((r) => ({
        id: r.id,
        status: r.status,
        vehicleType: r.vehicle_type,
        attemptCount: r.attempt_count,
        estimatedFare: r.estimated_fare !== null ? Number(r.estimated_fare) : null,
        estimatedPickupEtaMin:
          r.estimated_pickup_eta_min !== null ? Number(r.estimated_pickup_eta_min) : null,
        tripDistanceKm: r.trip_distance_km !== null ? Number(r.trip_distance_km) : null,
        pickup: {
          lat: r.pickup_lat,
          lng: r.pickup_lng,
          label: r.pickup_label || '',
        },
        drop: {
          lat: r.drop_lat,
          lng: r.drop_lng,
          label: r.drop_label || '',
        },
        passengerName: r.passenger_name,
        currentDriverId: r.current_driver_id,
        offeredDriverId: r.offered_driver_id,
        pendingOfferId: r.pending_offer_id,
        offerSecondsLeft:
          r.offer_seconds_left !== null
            ? Math.max(0, Number(Number(r.offer_seconds_left).toFixed(1)))
            : null,
        createdAt: r.created_at,
      }));

      const rideByDriverId = new Map();
      for (const ride of activeRides) {
        if (ride.currentDriverId) {
          rideByDriverId.set(ride.currentDriverId, {
            id: ride.id,
            status: ride.status,
            relation: 'ASSIGNED',
          });
        } else if (ride.offeredDriverId) {
          rideByDriverId.set(ride.offeredDriverId, {
            id: ride.id,
            status: ride.status,
            relation: 'OFFERED',
          });
        }
      }

      const vehicles = vehicleRows.map((row) => ({
        ...formatDriver(row),
        activeRide: rideByDriverId.get(row.id) ?? null,
      }));

      const summary = {
        totalVehicles: vehicles.length,
        available: vehicles.filter((v) => v.status === 'AVAILABLE').length,
        busy: vehicles.filter((v) => v.status === 'BUSY').length,
        offline: vehicles.filter((v) => v.status === 'OFFLINE').length,
        activeRides: activeRides.length,
      };

      res.json({
        vehicles,
        activeRides,
        summary,
        updatedAt: new Date().toISOString(),
      });
    })
  );

  return router;
}
