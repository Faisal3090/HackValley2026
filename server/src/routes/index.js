import { Router } from 'express';
import { createAuthRouter } from './auth.js';
import { createDriversRouter } from './drivers.js';
import { createRidesRouter } from './rides.js';
import { createOffersRouter } from './offers.js';
import { createNotificationsRouter } from './notifications.js';
import { createDispatchRouter } from './dispatch.js';
import { createDevRouter } from './dev.js';
import { createPlacesRouter } from './places.js';

export function createApiRouter({ pool, config }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.use('/auth', createAuthRouter({ pool, config }));
  router.use('/drivers', createDriversRouter({ pool, config }));
  router.use('/rides', createRidesRouter({ pool, config }));
  router.use('/offers', createOffersRouter({ pool, config }));
  router.use('/notifications', createNotificationsRouter({ pool, config }));
  router.use('/dispatch', createDispatchRouter({ pool, config }));
  router.use('/places', createPlacesRouter({ pool, config }));
  router.use('/dev', createDevRouter({ pool, config }));

  return router;
}
