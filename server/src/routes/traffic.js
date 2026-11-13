import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errors.js';
import { createRequireAuth } from '../middleware/auth.js';
import { getTrafficOverview, createOrMergeIncident, simulateClosure, optimizeSignal, getEmergencyRoute, compareRoutes } from '../services/traffic.js';

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const routeBody = z.object({ origin: point, destination: point });

export function createTrafficRouter({ pool, config }) {
  const router = Router();
  const requireAuth = createRequireAuth({ pool, cfg: config });
  router.get('/overview', requireAuth, asyncHandler(async (req, res) => { res.json(await getTrafficOverview({ pool, config, horizon: Number(req.query.horizon) === 30 ? 30 : 15 })); }));
  router.post('/incidents', requireAuth, asyncHandler(async (req, res) => { res.status(201).json(await createOrMergeIncident({ pool, config, incident: req.body })); }));
  router.post('/incidents/simulate', requireAuth, asyncHandler(async (req, res) => { res.json(simulateClosure({ config, incident: req.body.incident || req.body, origin: req.body.origin, destination: req.body.destination })); }));
  router.post('/signals/optimize', requireAuth, asyncHandler(async (req, res) => { res.json(optimizeSignal(req.body)); }));
  router.post('/emergency-route', requireAuth, asyncHandler(async (req, res) => { const body = routeBody.parse(req.body); res.json(await getEmergencyRoute({ config, ...body })); }));
  router.post('/route-options', requireAuth, asyncHandler(async (req, res) => { const body = routeBody.parse(req.body); res.json(await compareRoutes({ config, ...body })); }));
  return router;
}
