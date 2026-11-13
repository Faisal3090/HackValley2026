import { Router } from 'express';
import { asyncHandler, AppError } from '../middleware/errors.js';
import { createRequireAuth } from '../middleware/auth.js';
import {
  listDispatchNotifications,
  listNotifications,
  markNotificationRead,
} from '../services/notifications.js';

export function createNotificationsRouter({ pool, config }) {
  const router = Router();
  const requireAuth = createRequireAuth({ pool, cfg: config });

  router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
      const includeDispatch =
        req.query.scope === 'dispatch' &&
        (config.DEMO_MODE || req.user.role === 'admin');

      const notifications = includeDispatch
        ? await listDispatchNotifications(
            req.user.id,
            { includeAdminDispatch: true },
            pool
          )
        : await listNotifications(req.user.id, pool);
      res.json({ notifications });
    })
  );

  router.post(
    '/:id/read',
    requireAuth,
    asyncHandler(async (req, res) => {
      const notificationId = Number(req.params.id);
      if (!Number.isInteger(notificationId) || notificationId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid notification id');
      }
      const notification = await markNotificationRead(
        notificationId,
        req.user.id,
        pool
      );
      if (!notification) {
        throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
      }
      res.json({ notification });
    })
  );

  return router;
}
