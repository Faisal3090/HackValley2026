ALTER TABLE drivers ADD COLUMN fuel_cost_per_km NUMERIC CHECK (fuel_cost_per_km >= 0);
ALTER TABLE drivers ADD COLUMN maintenance_cost_per_km NUMERIC CHECK (maintenance_cost_per_km >= 0);
ALTER TABLE drivers ADD COLUMN base_lat DOUBLE PRECISION CHECK (base_lat BETWEEN -90 AND 90);
ALTER TABLE drivers ADD COLUMN base_lng DOUBLE PRECISION CHECK (base_lng BETWEEN -180 AND 180);
ALTER TABLE drivers ADD CONSTRAINT driver_base_pair CHECK ((base_lat IS NULL) = (base_lng IS NULL));
ALTER TABLE rides ADD COLUMN earnings_snapshot JSONB;
ALTER TABLE rides ADD COLUMN actual_passenger_distance_km NUMERIC CHECK (actual_passenger_distance_km >= 0);
