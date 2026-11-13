import crypto from 'node:crypto';
import defaultConfig from '../config/index.js';
import defaultPool from '../db/pool.js';
import { withTransaction } from '../db/tx.js';
import { haversineKm } from './geo.js';
import { getEtaMatrix, getRoute } from './routing.js';
import { rankWithFallback } from '../rankers/index.js';
import { recordEvent, publishAfterCommit } from './events.js';

const activeStatuses = ['ACCEPTED', 'ARRIVING'];

function pickupOf(ride) {
  return { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) };
}

function driverForRanking(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    vehicleType: row.vehicle_type,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    onlineSince: row.online_since,
    lastHeartbeat: row.last_heartbeat,
    offersReceived: row.offers_received,
    ridesCompleted: row.rides_completed,
    acceptRate: Number(row.accept_rate),
    hasPendingOffer: Boolean(row.has_pending_offer),
  };
}

async function availableDrivers(client, config) {
  const { rows } = await client.query(`
    SELECT d.*, u.name,
      EXISTS (SELECT 1 FROM offers o WHERE o.driver_id = d.id AND o.status = 'PENDING') AS has_pending_offer
    FROM drivers d JOIN users u ON u.id = d.user_id
    WHERE d.status = 'AVAILABLE' AND d.lat IS NOT NULL AND d.lng IS NOT NULL
    FOR UPDATE SKIP LOCKED
  `);
  return rows.map(driverForRanking).filter((driver) => !driver.hasPendingOffer);
}

export async function batchAllocate({ rideIds, pool = defaultPool, config = defaultConfig }) {
  const events = [];
  const result = await withTransaction(async (client) => {
    const ids = rideIds.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 10);
    if (ids.length === 0) return { assignments: [], unmatchedRideIds: [] };

    const ridesRes = await client.query(
      `SELECT r.*, u.name AS passenger_name
       FROM rides r JOIN users u ON u.id = r.passenger_id
       WHERE r.id = ANY($1::int[]) AND r.status = 'REQUESTED'
       ORDER BY r.created_at, r.id FOR UPDATE`,
      [ids]
    );
    const drivers = await availableDrivers(client, config);
    const assignments = [];
    const used = new Set();

    for (const ride of ridesRes.rows) {
      const compatible = drivers.filter((driver) => {
        if (used.has(driver.id)) return false;
        if (ride.vehicle_type && driver.vehicleType !== ride.vehicle_type) return false;
        return haversineKm(pickupOf(ride), driver) <= config.SEARCH_RADIUS_KM;
      });
      if (compatible.length === 0) continue;

      const matrix = await getEtaMatrix(compatible, pickupOf(ride), { config });
      const candidates = compatible.map((driver) => ({
        driver,
        distanceKm: matrix[driver.id]?.distanceKm ?? haversineKm(pickupOf(ride), driver),
        etaMin: matrix[driver.id]?.etaMin ?? 999,
      }));
      const { ranked } = rankWithFallback({ ride, candidates, config, now: new Date() });
      const top = ranked[0];
      if (!top) continue;

      const decisionId = `BATCH-${crypto.randomUUID().slice(0, 8)}`;
      const offerRes = await client.query(
        `INSERT INTO offers (ride_id, driver_id, status, expires_at, rank_position, score, decision_id)
         VALUES ($1, $2, 'PENDING', now() + ($3 || ' seconds')::interval, 1, $4, $5) RETURNING *`,
        [ride.id, top.driver.id, String(config.OFFER_TIMEOUT_SECONDS), top.score, decisionId]
      );
      await client.query('UPDATE drivers SET offers_received = offers_received + 1 WHERE id = $1', [top.driver.id]);
      await client.query(`UPDATE rides SET status = 'DRIVER_OFFERED', attempt_count = attempt_count + 1, estimated_pickup_eta_min = $2, version = version + 1 WHERE id = $1`, [ride.id, top.etaMin]);
      used.add(top.driver.id);
      assignments.push({ rideId: ride.id, driverId: top.driver.id, etaMin: top.etaMin, score: top.score, reason: top.reason, offerId: offerRes.rows[0].id, decisionId });
      events.push(await recordEvent(client, { eventType: 'DRIVER_OFFERED', rideId: ride.id, driverId: top.driver.id, offerId: offerRes.rows[0].id, payload: { batch: true, decisionId, driverName: top.driver.name, etaMin: top.etaMin, reason: top.reason } }));
    }
    return { assignments, unmatchedRideIds: ids.filter((id) => !assignments.some((item) => item.rideId === id)) };
  }, pool);
  publishAfterCommit(events);
  return { ...result, batchSize: rideIds.length };
}

export async function reassignSlowRides({ pool = defaultPool, config = defaultConfig, rideIds = null }) {
  const query = rideIds?.length
    ? [`SELECT r.*, d.lat AS driver_lat, d.lng AS driver_lng FROM rides r JOIN drivers d ON d.id = r.current_driver_id WHERE r.id = ANY($1::int[]) AND r.status = ANY($2::text[]) AND d.lat IS NOT NULL AND d.lng IS NOT NULL`, [rideIds.map(Number), activeStatuses]]
    : [`SELECT r.*, d.lat AS driver_lat, d.lng AS driver_lng FROM rides r JOIN drivers d ON d.id = r.current_driver_id WHERE r.status = ANY($1::text[]) AND d.lat IS NOT NULL AND d.lng IS NOT NULL`, [activeStatuses]];
  const { rows } = await pool.query(...query);
  const reassigned = [];

  for (const ride of rows) {
    const pickup = pickupOf(ride);
    const currentRoute = await getRoute({ lat: ride.driver_lat, lng: ride.driver_lng }, pickup, { config });
    const availableRes = await pool.query(`SELECT d.*, u.name FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.status = 'AVAILABLE' AND d.lat IS NOT NULL AND d.lng IS NOT NULL AND d.id <> $1`, [ride.current_driver_id]);
    const nearby = availableRes.rows.filter((driver) => (!ride.vehicle_type || driver.vehicle_type === ride.vehicle_type) && haversineKm(pickup, driver) <= config.SEARCH_RADIUS_KM);
    if (!nearby.length) continue;
    const matrix = await getEtaMatrix(nearby, pickup, { config });
    const candidates = nearby.map((row) => ({ driver: driverForRanking(row), distanceKm: matrix[row.id].distanceKm, etaMin: matrix[row.id].etaMin }));
    const { ranked } = rankWithFallback({ ride, candidates, config, now: new Date() });
    const alternative = ranked[0];
    if (!alternative) continue;
    const savings = currentRoute.durationMin - alternative.etaMin;
    if (!alternative || savings < (config.REASSIGNMENT_MIN_SAVINGS_MIN ?? 5)) continue;

    const events = [];
    const updated = await withTransaction(async (client) => {
      const locked = await client.query('SELECT * FROM rides WHERE id = $1 FOR UPDATE', [ride.id]);
      if (!locked.rows[0] || !activeStatuses.includes(locked.rows[0].status) || locked.rows[0].current_driver_id !== ride.current_driver_id) return null;
      const oldDriverId = ride.current_driver_id;
      await client.query("UPDATE drivers SET status = 'AVAILABLE' WHERE id = $1 AND status = 'BUSY'", [oldDriverId]);
      const newDriver = await client.query("UPDATE drivers SET status = 'BUSY' WHERE id = $1 AND status = 'AVAILABLE' RETURNING id", [alternative.driver.id]);
      if (!newDriver.rows[0]) return null;
      const updatedRide = await client.query(`UPDATE rides SET current_driver_id = $2, estimated_pickup_eta_min = $3, version = version + 1 WHERE id = $1 RETURNING *`, [ride.id, alternative.driver.id, alternative.etaMin]);
      await client.query("UPDATE offers SET status = 'REJECTED', responded_at = now(), version = version + 1 WHERE ride_id = $1 AND driver_id = $2 AND status = 'ACCEPTED'", [ride.id, oldDriverId]);
      const offer = await client.query(`INSERT INTO offers (ride_id, driver_id, status, expires_at, rank_position, score, decision_id, responded_at) VALUES ($1,$2,'ACCEPTED',now(),1,$3,$4,now()) RETURNING id`, [ride.id, alternative.driver.id, alternative.score, `REASSIGN-${crypto.randomUUID().slice(0, 8)}`]);
      events.push(await recordEvent(client, { eventType: 'RIDE_REASSIGNED', rideId: ride.id, driverId: alternative.driver.id, offerId: offer.rows[0].id, payload: { fromDriverId: oldDriverId, toDriverId: alternative.driver.id, previousEtaMin: currentRoute.durationMin, newEtaMin: alternative.etaMin, timeSavedMin: Number(savings.toFixed(1)), reason: 'traffic_eta_degradation' } }));
      return updatedRide.rows[0];
    }, pool);
    publishAfterCommit(events);
    if (updated) reassigned.push({ rideId: ride.id, fromDriverId: ride.current_driver_id, toDriverId: alternative.driver.id, previousEtaMin: currentRoute.durationMin, newEtaMin: alternative.etaMin, timeSavedMin: Number(savings.toFixed(1)) });
  }
  return { reassigned };
}
