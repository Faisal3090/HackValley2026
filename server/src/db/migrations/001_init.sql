CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('passenger', 'driver', 'admin')),
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('AUTO', 'HATCHBACK', 'SEDAN', 'SUV')),
  vehicle_number TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT NOT NULL CHECK (status IN ('OFFLINE', 'AVAILABLE', 'BUSY')) DEFAULT 'OFFLINE',
  online_since TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ,
  offers_received INT NOT NULL DEFAULT 0,
  rides_completed INT NOT NULL DEFAULT 0,
  accept_rate NUMERIC(3,2) NOT NULL DEFAULT 0.80
);

CREATE TABLE IF NOT EXISTS rides (
  id SERIAL PRIMARY KEY,
  passenger_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  pickup_label TEXT DEFAULT '',
  drop_lat DOUBLE PRECISION NOT NULL,
  drop_lng DOUBLE PRECISION NOT NULL,
  drop_label TEXT DEFAULT '',
  vehicle_type TEXT NULL CHECK (vehicle_type IS NULL OR vehicle_type IN ('AUTO', 'HATCHBACK', 'SEDAN', 'SUV')),
  status TEXT NOT NULL CHECK (status IN (
    'REQUESTED',
    'DRIVER_OFFERED',
    'ACCEPTED',
    'ARRIVING',
    'ONGOING',
    'COMPLETED',
    'UNFULFILLED',
    'CANCELLED'
  )),
  version INT NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 0,
  current_driver_id INT NULL REFERENCES drivers(id),
  trip_distance_km NUMERIC,
  trip_duration_min NUMERIC,
  estimated_pickup_eta_min NUMERIC,
  estimated_fare NUMERIC,
  final_fare NUMERIC,
  fare_breakdown JSONB,
  zone_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  arriving_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  ride_id INT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id INT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 0,
  rank_position INT,
  score NUMERIC,
  decision_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ride_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  ride_id INT,
  driver_id INT NULL,
  offer_id INT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id INT NULL REFERENCES rides(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  user_id INT NOT NULL,
  endpoint TEXT NOT NULL,
  response_status INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key, user_id, endpoint)
);

-- Enforce dispatch invariants at the database level
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_offer_per_ride
  ON offers(ride_id)
  WHERE status = 'PENDING';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'one_offer_per_driver_per_ride'
  ) THEN
    ALTER TABLE offers ADD CONSTRAINT one_offer_per_driver_per_ride UNIQUE (ride_id, driver_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_ride_per_passenger
  ON rides(passenger_id)
  WHERE status IN ('REQUESTED', 'DRIVER_OFFERED', 'ACCEPTED', 'ARRIVING', 'ONGOING');

CREATE UNIQUE INDEX IF NOT EXISTS one_active_ride_per_driver
  ON rides(current_driver_id)
  WHERE current_driver_id IS NOT NULL AND status IN ('ACCEPTED', 'ARRIVING', 'ONGOING');

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_offers_status_expires ON offers(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_rides_passenger_created ON rides(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_events_ride_occurred ON ride_events(ride_id, occurred_at ASC);
