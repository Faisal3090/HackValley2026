import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const boolFromEnv = (defaultVal) =>
  z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return val;
  }, z.boolean());

const jsonFromEnv = (schema, defaultVal) =>
  z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }, schema);

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://postgres:postgres@localhost:5432/ridematch'),
  TEST_DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://postgres:postgres@localhost:5432/ridematch_test'),
  GEOAPIFY_API_KEY: z.string().optional().default(''),
  JWT_SECRET: z.string().min(1).default('dev-secret-change-in-production'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  OFFER_TIMEOUT_SECONDS: z.coerce.number().positive().default(15),
  MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  SEARCH_RADIUS_KM: z.coerce.number().positive().default(5),
  AVG_SPEED_KMH: z.coerce.number().positive().default(25),
  RANKER: z.string().min(1).default('nearest'),
  RANKER_WEIGHTS: jsonFromEnv(z.record(z.string(), z.number()), {}),
  FAIR_DISPATCH_ENABLED: boolFromEnv(true),
  ROUTING_PROVIDER: z.enum(['osrm', 'haversine']).default('osrm'),
  OSRM_BASE_URL: z.string().url().default('https://router.project-osrm.org'),
  ROUTING_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  FARE_BASE: z.coerce.number().nonnegative().default(50),
  FARE_PER_KM: z.coerce.number().nonnegative().default(12),
  FARE_VEHICLE_MULTIPLIER: jsonFromEnv(
    z.object({
      AUTO: z.number().positive(),
      HATCHBACK: z.number().positive(),
      SEDAN: z.number().positive(),
      SUV: z.number().positive(),
    }),
    { AUTO: 0.8, HATCHBACK: 1.0, SEDAN: 1.2, SUV: 1.5 }
  ),
  DRIVER_PAYOUT_PERCENT: z.coerce.number().min(0).max(1).default(0.8),
  FARE_MULTIPLIER_MIN: z.coerce.number().positive().default(0.5),
  FARE_MULTIPLIER_MAX: z.coerce.number().positive().default(2.0),
  STALE_HEARTBEAT_SECONDS: z.coerce.number().nonnegative().default(0),
  DEMO_MODE: boolFromEnv(true),
  SERVICE_API_KEY: z.string().min(1).default('dev-service-key'),
  CITY_CENTER_LAT: z.coerce.number().min(-90).max(90).default(15.8497),
  CITY_CENTER_LNG: z.coerce.number().min(-180).max(180).default(74.4977),
});

export function loadConfig(overrides = {}) {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${details}`);
  }
  const cfg = parsed.data;
  if (cfg.FARE_MULTIPLIER_MIN > cfg.FARE_MULTIPLIER_MAX) {
    throw new Error('Invalid configuration: FARE_MULTIPLIER_MIN cannot exceed FARE_MULTIPLIER_MAX');
  }
  return {
    ...cfg,
    weights: cfg.RANKER_WEIGHTS,
  };
}

export const config = loadConfig();
export default config;
