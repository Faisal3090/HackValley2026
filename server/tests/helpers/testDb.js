import bcrypt from 'bcryptjs';
import { loadConfig } from '../../src/config/index.js';
import { createPool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createApp } from '../../src/app.js';

export function createTestContext(configOverrides = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    OFFER_TIMEOUT_SECONDS: '2',
    MAX_ATTEMPTS: '3',
    SEARCH_RADIUS_KM: '5',
    ROUTING_PROVIDER: 'haversine',
    DEMO_MODE: 'true',
    ...configOverrides,
  });

  const pool = createPool(config.TEST_DATABASE_URL);
  const app = createApp({ pool, config });

  return { config, pool, app };
}

export async function resetTestDb(pool) {
  await runMigrations(pool);
  await pool.query(`
    TRUNCATE TABLE
      idempotency_keys,
      notifications,
      ride_events,
      offers,
      rides,
      drivers,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function seedFourDriverFixture(pool, config) {
  const passwordHash = await bcrypt.hash('pass1234', 10);

  const passengerRes = await pool.query(
    `INSERT INTO users (username, password_hash, role, name, phone)
     VALUES ('p_test', $1, 'passenger', 'Test Passenger', '9000000001')
     RETURNING id, username, role, name`,
    [passwordHash]
  );

  const driversSpec = [
    { username: 'd1', name: 'Driver One', vehicleType: 'HATCHBACK', dLat: 0.004, dLng: 0.002 },
    { username: 'd2', name: 'Driver Two', vehicleType: 'SEDAN', dLat: 0.009, dLng: 0.004 },
    { username: 'd3', name: 'Driver Three', vehicleType: 'AUTO', dLat: 0.015, dLng: 0.006 },
    { username: 'd4', name: 'Driver Four', vehicleType: 'SUV', dLat: 0.022, dLng: 0.008 },
  ];

  const drivers = [];
  for (const spec of driversSpec) {
    const uRes = await pool.query(
      `INSERT INTO users (username, password_hash, role, name, phone)
       VALUES ($1, $2, 'driver', $3, '9100000000')
       RETURNING id, username, role, name`,
      [spec.username, passwordHash, spec.name]
    );
    const dRes = await pool.query(
      `INSERT INTO drivers (
         user_id, vehicle_type, vehicle_number, lat, lng, status, online_since, last_heartbeat
       )
       VALUES ($1, $2, $3, $4, $5, 'AVAILABLE', now() - interval '60 minutes', now())
       RETURNING *`,
      [
        uRes.rows[0].id,
        spec.vehicleType,
        `TEST-${uRes.rows[0].id}`,
        config.CITY_CENTER_LAT + spec.dLat,
        config.CITY_CENTER_LNG + spec.dLng,
      ]
    );
    drivers.push({ user: uRes.rows[0], driver: dRes.rows[0] });
  }

  return { passenger: passengerRes.rows[0], drivers };
}
