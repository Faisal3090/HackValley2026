import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { rankWithFallback } from '../rankers/index.js';
import { filterProvidedCandidates } from '../services/eligibility.js';
import { getZoneIntelligence } from '../services/zoneIntelligence.js';

const allocateSchema = z.object({
  rideId: z.union([z.string(), z.number()]).transform(String),
  pickup: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  requirements: z
    .object({
      vehicleType: z.enum(['AUTO', 'HATCHBACK', 'SEDAN', 'SUV']).optional(),
      seats: z.number().int().positive().optional(),
    })
    .optional()
    .default({}),
  candidates: z
    .array(
      z.object({
        driverId: z.union([z.string(), z.number()]),
        name: z.string().optional(),
        distanceKm: z.number().nonnegative().optional(),
        pickupEtaMinutes: z.number().nonnegative().optional(),
        online: z.boolean().optional(),
        available: z.boolean().optional(),
        vehicleType: z.enum(['AUTO', 'HATCHBACK', 'SEDAN', 'SUV']).optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        offersReceived: z.number().int().nonnegative().optional(),
        ridesCompleted: z.number().int().nonnegative().optional(),
        acceptRate: z.number().min(0).max(1).optional(),
        onlineSince: z.string().optional(),
        lastHeartbeat: z.string().optional(),
        hasPendingOffer: z.boolean().optional(),
        alreadyOfferedThisRide: z.boolean().optional(),
      })
    )
    .default([]),
  zoneId: z.string().nullable().optional(),
});

export function createDispatchRouter({ pool, config }) {
  const router = Router();

  const requireServiceOrAdmin = async (req, _res, next) => {
    const serviceKey = req.headers['x-service-key'];
    if (serviceKey && serviceKey === config.SERVICE_API_KEY) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      try {
        const payload = jwt.verify(token, config.JWT_SECRET);
        if (payload.role === 'admin') {
          req.user = payload;
          return next();
        }
        return next(new AppError(403, 'FORBIDDEN', 'Admin role required'));
      } catch {
        return next(new AppError(401, 'UNAUTHORIZED', 'Invalid token'));
      }
    }

    return next(
      new AppError(401, 'UNAUTHORIZED', 'Valid X-Service-Key or admin token required')
    );
  };

  router.post(
    '/allocate',
    requireServiceOrAdmin,
    validateBody(allocateSchema),
    asyncHandler(async (req, res) => {
      const { rideId, pickup, requirements, candidates: rawCandidates, zoneId } =
        req.body;

      const syntheticRide = {
        id: rideId,
        pickup,
        pickup_lat: pickup.latitude,
        pickup_lng: pickup.longitude,
        vehicle_type: requirements?.vehicleType ?? null,
        vehicleType: requirements?.vehicleType ?? null,
        requirements,
        zone_id: zoneId ?? null,
      };

      const [eligible, zone] = await Promise.all([
        filterProvidedCandidates(rawCandidates, syntheticRide, { pool, config }),
        getZoneIntelligence(pickup.latitude, pickup.longitude),
      ]);

      const { ranked, rankerUsed, fellBack } = rankWithFallback({
        ride: syntheticRide,
        candidates: eligible,
        zone: zoneId ? { ...zone, zoneId } : zone,
        config,
        now: new Date(),
      });

      const decisionId = `DEC-${crypto.randomUUID().slice(0, 8)}`;
      const selected = ranked[0] ?? null;

      res.json({
        rideId,
        decisionId,
        selectedDriverId: selected ? selected.driver.id : null,
        status: selected ? 'OFFER_READY' : 'NO_ELIGIBLE_DRIVERS',
        rankerUsed,
        fellBack,
        rankedDrivers: ranked.map((entry) => ({
          driverId: entry.driver.id,
          score: entry.score,
          distanceKm: entry.distanceKm,
          etaMin: entry.etaMin,
          reason: entry.reason,
          factors: entry.factors,
        })),
      });
    })
  );

  return router;
}
