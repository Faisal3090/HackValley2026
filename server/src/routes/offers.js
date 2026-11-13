import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errors.js';
import { createRequireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { validateBody } from '../middleware/validate.js';
import { createIdempotencyMiddleware } from '../middleware/idempotency.js';
import { respondToOffer } from '../services/offers.js';

const respondSchema = z.object({
  action: z.enum(['accept', 'reject']),
});

export function createOffersRouter({ pool, config }) {
  const router = Router();
  const requireAuth = createRequireAuth({ pool, cfg: config });
  const idempotency = createIdempotencyMiddleware({ pool });

  const roleGuard = config.DEMO_MODE
    ? (_req, _res, next) => next()
    : requireRole('driver', 'admin');

  router.post(
    '/:id/respond',
    requireAuth,
    roleGuard,
    idempotency,
    validateBody(respondSchema),
    asyncHandler(async (req, res) => {
      const offerId = Number(req.params.id);
      if (!Number.isInteger(offerId) || offerId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid offer id');
      }

      const result = await respondToOffer(
        offerId,
        req.body.action,
        req.user,
        { pool, config }
      );
      res.json(result);
    })
  );

  return router;
}
