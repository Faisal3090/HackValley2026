import defaultPool from '../db/pool.js';

export async function createNotification({ userId, rideId = null, message }, pool = defaultPool) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, ride_id, message)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, ride_id, message, read, created_at`,
    [userId, rideId, message]
  );
  return rows[0];
}

export async function listNotifications(userId, pool = defaultPool) {
  const { rows } = await pool.query(
    `SELECT id, user_id, ride_id, message, read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
}

export async function listDispatchNotifications(
  userId,
  { includeAdminDispatch = false } = {},
  pool = defaultPool
) {
  if (!includeAdminDispatch) {
    return listNotifications(userId, pool);
  }

  const { rows } = await pool.query(
    `SELECT n.id, n.user_id, n.ride_id, n.message, n.read, n.created_at
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     WHERE n.user_id = $1
        OR u.role = 'admin'
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
}

export async function markNotificationRead(notificationId, userId, pool = defaultPool) {
  const { rows } = await pool.query(
    `UPDATE notifications
     SET read = true
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, ride_id, message, read, created_at`,
    [notificationId, userId]
  );
  return rows[0] || null;
}
