import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import defaultPool from '../db/pool.js';
import { AppError } from './errors.js';

export function signToken(user, cfg = config) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      role: user.role,
    },
    cfg.JWT_SECRET,
    { expiresIn: cfg.JWT_EXPIRES_IN }
  );
}

export function createRequireAuth({ pool = defaultPool, cfg = config } = {}) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      }

      const token = header.slice('Bearer '.length).trim();
      if (!token) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      }

      let payload;
      try {
        payload = jwt.verify(token, cfg.JWT_SECRET);
      } catch {
        return next(new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token'));
      }

      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        return next(new AppError(401, 'INVALID_TOKEN', 'Invalid token subject'));
      }

      const { rows } = await pool.query(
        'SELECT id, username, email, role, name, phone, created_at FROM users WHERE id = $1',
        [userId]
      );
      if (rows.length === 0) {
        return next(new AppError(401, 'UNAUTHORIZED', 'User not found'));
      }

      req.user = rows[0];
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export const requireAuth = createRequireAuth();
