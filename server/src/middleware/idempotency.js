import defaultPool from '../db/pool.js';

export function createIdempotencyMiddleware({ pool = defaultPool } = {}) {
  return async (req, res, next) => {
    const rawKey = req.headers['idempotency-key'];
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key || !req.user) {
      return next();
    }

    const endpoint = `${req.method}:${req.baseUrl}${req.route?.path || req.path}`;

    try {
      const existing = await pool.query(
        `SELECT response_status, response_body
         FROM idempotency_keys
         WHERE key = $1 AND user_id = $2 AND endpoint = $3`,
        [key, req.user.id, endpoint]
      );
      if (existing.rows.length > 0) {
        const saved = existing.rows[0];
        return res.status(saved.response_status).json(saved.response_body);
      }
    } catch (err) {
      return next(err);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode || 200;
      if (status >= 200 && status < 500) {
        pool
          .query(
            `INSERT INTO idempotency_keys (key, user_id, endpoint, response_status, response_body)
             VALUES ($1, $2, $3, $4, $5::jsonb)
             ON CONFLICT (key, user_id, endpoint) DO NOTHING`,
            [key, req.user.id, endpoint, status, JSON.stringify(body ?? null)]
          )
          .catch((err) => {
            console.error('Failed to store idempotency response:', err);
          })
          .finally(() => {
            originalJson(body);
          });
        return res;
      }
      return originalJson(body);
    };

    return next();
  };
}
