import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTransaction } from '../db/tx.js';
import { asyncHandler, AppError } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { createRequireAuth, signToken } from '../middleware/auth.js';

const registerSchema = z.object({
  username: z.string().trim().min(2).max(50),
  password: z.string().min(4).max(100),
  role: z.enum(['passenger', 'driver']),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).email(),
  phone: z.string().trim().max(30).optional().default(''),
  vehicleType: z.enum(['AUTO', 'HATCHBACK', 'SEDAN', 'SUV']).optional(),
  vehicleNumber: z.string().trim().max(30).optional(),
  licenseNumber: z.string().trim().max(50).optional(),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

function sanitizeUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    name: row.name,
    email: row.email || null,
    phone: row.phone,
    createdAt: row.created_at,
  };
}

function sanitizeDriver(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    vehicleType: row.vehicle_type,
    vehicleNumber: row.vehicle_number,
    licenseNumber: row.license_number || null,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    onlineSince: row.online_since,
    lastHeartbeat: row.last_heartbeat,
    offersReceived: row.offers_received,
    ridesCompleted: row.rides_completed,
    acceptRate: Number(row.accept_rate),
  };
}

export function createAuthRouter({ pool, config }) {
  const router = Router();
  const requireAuth = createRequireAuth({ pool, cfg: config });

  router.post(
    '/register',
    validateBody(registerSchema),
    asyncHandler(async (req, res) => {
      const {
        username,
        password,
        role,
        name,
        email,
        phone,
        vehicleType,
        vehicleNumber,
        licenseNumber,
      } = req.body;

      const existing = await pool.query(
        `SELECT id FROM users
         WHERE lower(username) = lower($1)
            OR ($2::text IS NOT NULL AND lower(email) = lower($2))`,
        [username, email || null]
      );
      if (existing.rows.length > 0) {
        throw new AppError(409, 'USERNAME_TAKEN', 'Username or email is already registered');
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const { user, driver } = await withTransaction(async (client) => {
        const userRes = await client.query(
          `INSERT INTO users (username, email, password_hash, role, name, phone)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, username, email, role, name, phone, created_at`,
          [username, email?.toLowerCase() || null, passwordHash, role, name, phone || null]
        );
        const createdUser = userRes.rows[0];

        let createdDriver = null;
        if (role === 'driver') {
          const drvRes = await client.query(
            `INSERT INTO drivers (
               user_id, vehicle_type, vehicle_number, license_number, lat, lng, status
             )
             VALUES ($1, $2, $3, $4, $5, $6, 'OFFLINE')
             RETURNING *`,
            [
              createdUser.id,
              vehicleType || 'HATCHBACK',
              vehicleNumber || `KA22-${1000 + createdUser.id}`,
              licenseNumber || null,
              config.CITY_CENTER_LAT,
              config.CITY_CENTER_LNG,
            ]
          );
          createdDriver = drvRes.rows[0];
        }

        return { user: createdUser, driver: createdDriver };
      }, pool);

      const token = signToken(user, config);
      res.status(201).json({
        token,
        user: sanitizeUser(user),
        ...(driver ? { driver: sanitizeDriver(driver) } : {}),
      });
    })
  );

  router.post(
    '/login',
    validateBody(loginSchema),
    asyncHandler(async (req, res) => {
      const { username, password } = req.body;

      const { rows } = await pool.query(
        `SELECT * FROM users
         WHERE lower(username) = lower($1)
            OR lower(email) = lower($1)
            OR phone = $1
         LIMIT 2`,
        [username]
      );
      if (rows.length === 0) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
      }
      if (rows.length > 1) {
        throw new AppError(
          409,
          'AMBIGUOUS_LOGIN_IDENTIFIER',
          'This username, email, or phone number matches multiple accounts'
        );
      }

      const userRow = rows[0];
      const matches = await bcrypt.compare(password, userRow.password_hash);
      if (!matches) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
      }

      let driver = null;
      if (userRow.role === 'driver') {
        const drvRes = await pool.query(
          'SELECT * FROM drivers WHERE user_id = $1',
          [userRow.id]
        );
        driver = drvRes.rows[0] || null;
      }

      const token = signToken(userRow, config);
      res.json({
        token,
        user: sanitizeUser(userRow),
        ...(driver ? { driver: sanitizeDriver(driver) } : {}),
      });
    })
  );

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      let driver = null;
      if (req.user.role === 'driver') {
        const drvRes = await pool.query(
          'SELECT * FROM drivers WHERE user_id = $1',
          [req.user.id]
        );
        driver = drvRes.rows[0] || null;
      }

      res.json({
        user: sanitizeUser(req.user),
        driver: sanitizeDriver(driver),
      });
    })
  );

  return router;
}
