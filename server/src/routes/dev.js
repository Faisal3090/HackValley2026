import { Router } from 'express';
import { createRequireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errors.js';
import { seedDemoData } from '../seed/seed.js';
import { getRideHistory } from '../services/rides.js';

export function createDevRouter({ pool, config }) {
  const router = Router();
  const requireAuth = createRequireAuth({ pool, cfg: config });

  router.get('/config', (_req, res) => {
    res.json({
      ranker: config.RANKER,
      fairDispatchEnabled: config.FAIR_DISPATCH_ENABLED,
      routingProvider: config.ROUTING_PROVIDER,
      offerTimeoutSeconds: config.OFFER_TIMEOUT_SECONDS,
      maxAttempts: config.MAX_ATTEMPTS,
      searchRadiusKm: config.SEARCH_RADIUS_KM,
      demoMode: config.DEMO_MODE,
      cityCenter: {
        lat: config.CITY_CENTER_LAT,
        lng: config.CITY_CENTER_LNG,
      },
    });
  });

  router.get(
    '/rides',
    requireAuth,
    asyncHandler(async (_req, res) => {
      if (!config.DEMO_MODE) {
        throw new AppError(
          403,
          'DEMO_MODE_DISABLED',
          'Demo ride inspector is only available when DEMO_MODE=true'
        );
      }
      const rides = await getRideHistory({ role: 'admin' }, { pool });
      res.json({ rides });
    })
  );

  router.post(
    '/reset',
    asyncHandler(async (_req, res) => {
      if (!config.DEMO_MODE) {
        throw new AppError(
          403,
          'DEMO_MODE_DISABLED',
          'Demo reset is only available when DEMO_MODE=true'
        );
      }
      const credentials = await seedDemoData(pool, config);
      res.json({ reset: true, credentials });
    })
  );

  return router;
}
