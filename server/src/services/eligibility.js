import defaultConfig from '../config/index.js';
import defaultPool from '../db/pool.js';
import { eligibilityRules as defaultRules } from '../hooks/eligibilityRules.js';
import { etaMinutes, haversineKm } from './geo.js';
import { getEtaMatrix } from './routing.js';

function mapDbDriverRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    vehicleType: row.vehicle_type,
    vehicleNumber: row.vehicle_number,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    onlineSince: row.online_since,
    lastHeartbeat: row.last_heartbeat,
    offersReceived: row.offers_received,
    ridesCompleted: row.rides_completed,
    acceptRate: Number(row.accept_rate),
    hasPendingOffer: Boolean(row.has_pending_offer),
    alreadyOfferedThisRide: Boolean(row.already_offered_this_ride),
  };
}

export async function getEligibleCandidates(
  ride,
  { client = null, pool = defaultPool, config = defaultConfig, rules = defaultRules, now = new Date() } = {}
) {
  const db = client ?? pool;
  const rideId = Number.isInteger(Number(ride?.id)) ? Number(ride.id) : -1;

  const { rows } = await db.query(
    `SELECT d.*,
            u.name,
            EXISTS (
              SELECT 1 FROM offers o
              WHERE o.driver_id = d.id AND o.status = 'PENDING'
            ) AS has_pending_offer,
            EXISTS (
              SELECT 1 FROM offers o
              WHERE o.driver_id = d.id AND o.ride_id = $1
            ) AS already_offered_this_ride
     FROM drivers d
     JOIN users u ON u.id = d.user_id
     WHERE d.status = 'AVAILABLE'
       AND d.lat IS NOT NULL
       AND d.lng IS NOT NULL`,
    [rideId]
  );

  const pickup = {
    lat: ride.pickup_lat ?? ride.pickup?.lat ?? ride.pickup?.latitude,
    lng: ride.pickup_lng ?? ride.pickup?.lng ?? ride.pickup?.longitude,
  };

  const ctx = { ride, config, now };
  const survivors = rows
    .map(mapDbDriverRow)
    .filter((driver) => haversineKm(pickup, driver) <= config.SEARCH_RADIUS_KM)
    .filter((driver) => rules.every((rule) => rule(driver, ride, ctx)));

  if (survivors.length === 0) return [];

  const matrix = await getEtaMatrix(survivors, pickup, { config });
  return survivors.map((driver) => ({
    driver,
    distanceKm: matrix[driver.id].distanceKm,
    etaMin: matrix[driver.id].etaMin,
  }));
}

export async function filterProvidedCandidates(
  rawCandidates,
  ride,
  { pool = defaultPool, config = defaultConfig, rules = defaultRules, now = new Date() } = {}
) {
  const numericIds = rawCandidates
    .map((c) => Number(c.driverId))
    .filter((id) => Number.isInteger(id) && id > 0);

  const dbById = new Map();
  if (numericIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT d.*,
              u.name,
              EXISTS (
                SELECT 1 FROM offers o
                WHERE o.driver_id = d.id AND o.status = 'PENDING'
              ) AS has_pending_offer
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = ANY($1::int[])`,
      [numericIds]
    );
    for (const row of rows) {
      dbById.set(row.id, mapDbDriverRow({ ...row, already_offered_this_ride: false }));
    }
  }

  const ctx = { ride, config, now };
  const candidates = [];

  for (const item of rawCandidates) {
    const online = item.online !== undefined ? Boolean(item.online) : true;
    const available = item.available !== undefined ? Boolean(item.available) : true;
    if (!online || !available) continue;

    const numericId = Number(item.driverId);
    const dbDriver = Number.isInteger(numericId) ? dbById.get(numericId) : null;

    if (dbDriver && dbDriver.status !== 'AVAILABLE' && item.available !== true) {
      continue;
    }

    const driver = dbDriver
      ? {
          ...dbDriver,
          vehicleType: item.vehicleType ?? dbDriver.vehicleType,
        }
      : {
          id: item.driverId,
          userId: null,
          name: item.name || String(item.driverId),
          vehicleType: item.vehicleType || ride.vehicleType || 'HATCHBACK',
          vehicleNumber: item.vehicleNumber || null,
          lat: item.lat ?? item.latitude ?? null,
          lng: item.lng ?? item.longitude ?? null,
          status: 'AVAILABLE',
          onlineSince: item.onlineSince ?? null,
          lastHeartbeat: item.lastHeartbeat ?? null,
          offersReceived: item.offersReceived ?? 0,
          ridesCompleted: item.ridesCompleted ?? 0,
          acceptRate: item.acceptRate ?? 0.8,
          hasPendingOffer: Boolean(item.hasPendingOffer),
          alreadyOfferedThisRide: Boolean(item.alreadyOfferedThisRide),
        };

    const distanceKm =
      typeof item.distanceKm === 'number'
        ? item.distanceKm
        : driver.lat != null && driver.lng != null
        ? haversineKm(
            { lat: ride.pickup.latitude, lng: ride.pickup.longitude },
            driver
          )
        : 0;

    if (distanceKm > config.SEARCH_RADIUS_KM) continue;

    const passes = rules.every((rule) => rule(driver, ride, ctx));
    if (!passes) continue;

    const etaMin =
      typeof item.pickupEtaMinutes === 'number'
        ? item.pickupEtaMinutes
        : etaMinutes(distanceKm, config.AVG_SPEED_KMH);

    candidates.push({ driver, distanceKm, etaMin });
  }

  return candidates;
}
