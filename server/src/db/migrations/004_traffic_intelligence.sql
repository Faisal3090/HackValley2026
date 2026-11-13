CREATE TABLE IF NOT EXISTS road_segments (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  geometry JSONB NOT NULL,
  length_km NUMERIC NOT NULL,
  lanes INT NOT NULL DEFAULT 1,
  capacity_vehicles_per_hour INT NOT NULL DEFAULT 900,
  speed_limit_kmh NUMERIC,
  road_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS traffic_observations (
  id BIGSERIAL PRIMARY KEY,
  road_segment_id BIGINT REFERENCES road_segments(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  vehicle_count INT,
  average_speed_kmh NUMERIC,
  occupancy NUMERIC,
  weather JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traffic_predictions (
  id BIGSERIAL PRIMARY KEY,
  road_segment_id BIGINT REFERENCES road_segments(id) ON DELETE CASCADE,
  predicted_for TIMESTAMPTZ NOT NULL,
  horizon_minutes INT NOT NULL,
  congestion_score NUMERIC NOT NULL,
  risk_level TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0.7,
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  road_segment_id BIGINT REFERENCES road_segments(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  lanes_blocked INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  description TEXT,
  source TEXT,
  dedupe_key TEXT,
  report_count INT NOT NULL DEFAULT 1,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS traffic_signals (
  id BIGSERIAL PRIMARY KEY,
  junction_id TEXT UNIQUE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  cycle_seconds INT NOT NULL DEFAULT 90,
  phases JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_traffic_predictions_time ON traffic_predictions(predicted_for, horizon_minutes);
CREATE INDEX IF NOT EXISTS idx_incidents_active ON incidents(status, reported_at DESC);

INSERT INTO road_segments (external_id, from_node, to_node, geometry, length_km, lanes, capacity_vehicles_per_hour, road_class)
VALUES
  ('Ring Road', 'N0', 'N1', '{"type":"LineString","coordinates":[[74.4797,15.8377],[74.4917,15.8457]]}', 1.4, 1, 700, 'arterial'),
  ('Station Road', 'N1', 'N2', '{"type":"LineString","coordinates":[[74.4887,15.8377],[74.5007,15.8457]]}', 1.75, 2, 880, 'arterial'),
  ('Market Junction', 'N2', 'N3', '{"type":"LineString","coordinates":[[74.4977,15.8377],[74.5097,15.8457]]}', 2.1, 3, 1060, 'primary'),
  ('College Road', 'N3', 'N4', '{"type":"LineString","coordinates":[[74.5067,15.8377],[74.5187,15.8457]]}', 2.45, 1, 1240, 'collector'),
  ('Airport Link', 'N4', 'N5', '{"type":"LineString","coordinates":[[74.5157,15.8377],[74.5277,15.8457]]}', 2.8, 2, 1420, 'arterial'),
  ('River Bridge', 'N5', 'N6', '{"type":"LineString","coordinates":[[74.5247,15.8377],[74.5367,15.8457]]}', 3.15, 3, 1600, 'primary')
ON CONFLICT (external_id) DO NOTHING;
