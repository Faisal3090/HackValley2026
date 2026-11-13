import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errors.js';
import { createRequireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { validateBody } from '../middleware/validate.js';
import { createIdempotencyMiddleware } from '../middleware/idempotency.js';
import { haversineKm } from '../services/geo.js';
import { getRoute, getEtaMatrix } from '../services/routing.js';
import { getZoneIntelligence } from '../services/zoneIntelligence.js';
import { calculateFare } from '../services/fare.js';
import {
  advanceRide,
  cancelRide,
  canViewRide,
  createRide,
  getRideDetail,
  getRideEvents,
  getRideHistory,
  driverCancelRide,
} from '../services/rides.js';

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const estimateSchema = z.object({
  pickup: pointSchema,
  drop: pointSchema,
  vehicleType: z.enum(['AUTO', 'HATCHBACK', 'SEDAN', 'SUV']).optional(),
});

const createRideSchema = z.object({
  pickup: pointSchema,
  drop: pointSchema,
  pickupLabel: z.string().max(200).optional().default(''),
  dropLabel: z.string().max(200).optional().default(''),
  vehicleType: z.enum(['AUTO', 'HATCHBACK', 'SEDAN', 'SUV']).nullable().optional(),
});

function parseRideId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'INVALID_ID', 'Invalid ride id');
  }
  return id;
}

export function createRidesRouter({ pool, config }) {
  const router = Router();
  const requireAuth = createRequireAuth({ pool, cfg: config });
  const idempotency = createIdempotencyMiddleware({ pool });

  router.post(
    '/estimate',
    requireAuth,
    requireRole('passenger'),
    validateBody(estimateSchema),
    asyncHandler(async (req, res) => {
      const { pickup, drop, vehicleType } = req.body;

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

      const params = [];
      let where = `d.status = 'AVAILABLE' AND d.lat IS NOT NULL AND d.lng IS NOT NULL`;
      if (vehicleType) {
        params.push(vehicleType);
        where += ` AND d.vehicle_type = $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT d.id, d.lat, d.lng
         FROM drivers d
         WHERE ${where}`,
        params
      );

      const nearby = rows.filter(
        (d) => haversineKm(pickup, { lat: d.lat, lng: d.lng }) <= config.SEARCH_RADIUS_KM
      );

      let nearestEtaMin = null;
      if (nearby.length > 0) {
        const matrix = await getEtaMatrix(nearby, pickup, { config });
        const etas = Object.values(matrix).map((m) => m.etaMin);
        nearestEtaMin = Number(Math.min(...etas).toFixed(1));
      }

      res.json({
        tripDistanceKm: route.distanceKm,
        tripDurationMin: route.durationMin,
        estimatedFare: fare.total,
        fareBreakdown: fare.breakdown,
        nearestEtaMin,
        nearbyDriverCount: nearby.length,
        routeSource: route.source,
      });
    })
  );

  router.post(
    '/',
    requireAuth,
    requireRole('passenger'),
    idempotency,
    validateBody(createRideSchema),
    asyncHandler(async (req, res) => {
      const ride = await createRide(
        {
          passengerId: req.user.id,
          pickup: req.body.pickup,
          drop: req.body.drop,
          pickupLabel: req.body.pickupLabel,
          dropLabel: req.body.dropLabel,
          vehicleType: req.body.vehicleType ?? null,
        },
        { pool, config }
      );
      res.status(201).json(ride);
    })
  );

  router.get(
    '/history',
    requireAuth,
    asyncHandler(async (req, res) => {
      const rides = await getRideHistory(req.user, { pool });
      res.json({ rides });
    })
  );

  router.get(
    '/active',
    requireAuth,
    requireRole('passenger'),
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT id FROM rides
         WHERE passenger_id = $1
           AND status IN ('REQUESTED', 'DRIVER_OFFERED', 'ACCEPTED', 'ARRIVING', 'ONGOING')
         ORDER BY created_at DESC
         LIMIT 1`,
        [req.user.id]
      );
      if (rows.length === 0) {
        return res.json({ ride: null });
      }
      const ride = await getRideDetail(rows[0].id, { pool, config });
      return res.json({ ride });
    })
  );

  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const rideId = parseRideId(req.params.id);
      const ride = await getRideDetail(rideId, { pool, config });
      if (!ride) {
        throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found');
      }
      const allowed = await canViewRide(ride, req.user, { pool, config });
      if (!allowed) {
        throw new AppError(403, 'FORBIDDEN', 'Not permitted to view this ride');
      }
      res.json(ride);
    })
  );

  router.get(
    '/:id/events',
    requireAuth,
    asyncHandler(async (req, res) => {
      const rideId = parseRideId(req.params.id);
      const ride = await getRideDetail(rideId, { pool, config });
      if (!ride) {
        throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found');
      }
      const allowed = await canViewRide(ride, req.user, { pool, config });
      if (!allowed) {
        throw new AppError(403, 'FORBIDDEN', 'Not permitted to view ride events');
      }
      const events = await getRideEvents(rideId, { pool });
      res.json({ events });
    })
  );

  router.get(
    '/:id/route',
    requireAuth,
    asyncHandler(async (req, res) => {
      const rideId = parseRideId(req.params.id);
      const ride = await getRideDetail(rideId, { pool, config });
      if (!ride) {
        throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found');
      }
      const allowed = await canViewRide(ride, req.user, { pool, config });
      if (!allowed) {
        throw new AppError(403, 'FORBIDDEN', 'Not permitted to view ride route');
      }

      const pickupToDropRoute = await getRoute(ride.pickup, ride.drop, { config });
      let driverToPickup = null;

      if (
        ride.currentDriver &&
        ride.currentDriver.lat != null &&
        ride.currentDriver.lng != null
      ) {
        const dRoute = await getRoute(
          { lat: ride.currentDriver.lat, lng: ride.currentDriver.lng },
          ride.pickup,
          { config }
        );
        driverToPickup = dRoute.geometry;
      } else if (ride.currentOffer) {
        const drvRes = await pool.query(
          'SELECT lat, lng FROM drivers WHERE id = $1',
          [ride.currentOffer.driverId]
        );
        const d = drvRes.rows[0];
        if (d && d.lat != null && d.lng != null) {
          const dRoute = await getRoute(
            { lat: d.lat, lng: d.lng },
            ride.pickup,
            { config }
          );
          driverToPickup = dRoute.geometry;
        }
      }

      res.json({
        ...(driverToPickup ? { driverToPickup } : {}),
        pickupToDrop: pickupToDropRoute.geometry,
        source: pickupToDropRoute.source,
      });
    })
  );

  router.post(
    '/:id/advance',
    requireAuth,
    requireRole('driver'),
    validateBody(z.object({ actualPassengerDistanceKm: z.number().finite().min(0).max(10000).optional() }).default({})),
    asyncHandler(async (req, res) => {
      const rideId = parseRideId(req.params.id);
      const ride = await advanceRide(rideId, req.user.id, { pool, config, actualPassengerDistanceKm: req.body.actualPassengerDistanceKm });
      res.json(ride);
    })
  );

  router.post(
    '/:id/cancel',
    requireAuth,
    requireRole('passenger'),
    asyncHandler(async (req, res) => {
      const rideId = parseRideId(req.params.id);
      const ride = await cancelRide(rideId, req.user.id, { pool, config });
      res.json(ride);
    })
  );

  router.post(
    '/:id/driver-cancel',
    requireAuth,
    requireRole('driver'),
    asyncHandler(async (req, res) => {
      const rideId = parseRideId(req.params.id);
      const ride = await driverCancelRide(rideId, req.user.id, { pool, config });
      res.json(ride);
    })
  );

  return router;
}
