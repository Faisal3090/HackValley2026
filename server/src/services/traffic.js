import { haversineKm } from './geo.js';
import { getRoute } from './routing.js';

const CITY = { lat: 15.8497, lng: 74.4977 };

const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, Number(n) || 0));
const risk = (score) => (score >= 0.75 ? 'HIGH' : score >= 0.45 ? 'MEDIUM' : 'LOW');

function seededSegments(cfg) {
  const c = { lat: cfg.CITY_CENTER_LAT ?? CITY.lat, lng: cfg.CITY_CENTER_LNG ?? CITY.lng };
  const names = ['Ring Road', 'Station Road', 'Market Junction', 'College Road', 'Airport Link', 'River Bridge'];
  return names.map((name, i) => {
    const a = { lat: c.lat + (i % 3 - 1) * 0.012, lng: c.lng + (i - 2) * 0.009 };
    const b = { lat: a.lat + 0.008, lng: a.lng + 0.012 };
    return { id: i + 1, name, fromNode: `N${i}`, toNode: `N${i + 1}`, start: a, end: b, lengthKm: 1.4 + i * 0.35, lanes: i % 3 + 1, capacity: 700 + i * 180 };
  });
}

function predictionFor(segment, horizonMinutes, now = new Date()) {
  const hour = now.getHours() + now.getMinutes() / 60;
  const rush = Math.max(0, 1 - Math.abs(hour - 18) / 4);
  const weather = hour > 16 && hour < 21 ? 0.08 : 0.02;
  const incident = segment.id === 3 ? 0.16 : 0;
  const score = clamp(0.2 + ((segment.id * 0.11) % 0.34) + rush * 0.36 + weather + incident + horizonMinutes / 1000);
  return {
    segmentId: segment.id,
    name: segment.name,
    geometry: { type: 'LineString', coordinates: [[segment.start.lng, segment.start.lat], [segment.end.lng, segment.end.lat]] },
    congestionScore: Number(score.toFixed(3)),
    riskLevel: risk(score),
    confidence: Number((0.72 + (segment.id % 3) * 0.06).toFixed(2)),
    factors: { historical: 0.2 + segment.id * 0.02, timeOfDay: Number(rush.toFixed(2)), roadCapacity: segment.capacity, weather, incidents: incident },
    suggestedAction: score >= 0.75 ? 'Avoid this segment; use the alternate route.' : score >= 0.45 ? 'Expect slower traffic in 15–30 minutes.' : 'Normal flow expected.',
  };
}

export function getDemoTraffic(cfg, horizon = 15) {
  return seededSegments(cfg).map((segment) => ({ ...predictionFor(segment, horizon), horizonMinutes: horizon }));
}

export async function getTrafficOverview({ pool, config, horizon = 15 }) {
  if (!pool) return { predictions: getDemoTraffic(config, horizon), source: 'demo' };
  try {
    const { rows } = await pool.query(`SELECT p.*, r.geometry, r.external_id AS name FROM traffic_predictions p JOIN road_segments r ON r.id = p.road_segment_id WHERE p.horizon_minutes = $1 AND p.predicted_for >= now() - interval '10 minutes' ORDER BY p.predicted_for DESC`, [horizon]);
    if (rows.length) return { predictions: rows.map((row) => ({
      segmentId: row.road_segment_id,
      name: row.name || `Road segment ${row.road_segment_id}`,
      geometry: row.geometry,
      congestionScore: Number(row.congestion_score),
      riskLevel: row.risk_level,
      confidence: Number(row.confidence),
      factors: row.explanation || {},
      horizonMinutes: row.horizon_minutes,
      suggestedAction: row.risk_level === 'HIGH' ? 'Avoid this segment; use the alternate route.' : row.risk_level === 'MEDIUM' ? 'Expect slower traffic in 15–30 minutes.' : 'Normal flow expected.',
    })), source: 'database' };
  } catch (error) { console.warn(`[traffic] overview fallback: ${error.message}`); }
  return { predictions: getDemoTraffic(config, horizon), source: 'demo' };
}

export async function refreshTrafficPredictions({ pool, config }) {
  if (!pool) return 0;
  const predictions = getDemoTraffic(config, 15).concat(getDemoTraffic(config, 30));
  try {
    for (const item of predictions) {
      await pool.query(`INSERT INTO traffic_predictions (road_segment_id, predicted_for, horizon_minutes, congestion_score, risk_level, confidence, explanation) VALUES ($1, now() + ($2 * interval '1 minute'), $2, $3, $4, $5, $6)`, [item.segmentId, item.horizonMinutes, item.congestionScore, item.riskLevel, item.confidence, item.factors]);
    }
    return predictions.length;
  } catch (error) { console.warn(`[traffic] refresh skipped: ${error.message}`); return 0; }
}

export async function createOrMergeIncident({ pool, config, incident }) {
  const lat = Number(incident.latitude ?? incident.lat);
  const lng = Number(incident.longitude ?? incident.lng);
  const type = incident.type || 'GENERAL';
  const key = `${type}:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  if (pool) {
    const existing = await pool.query(`SELECT * FROM incidents WHERE status = 'ACTIVE' AND type = $1 AND abs(latitude - $2) < 0.004 AND abs(longitude - $3) < 0.004 ORDER BY reported_at DESC LIMIT 1`, [type, lat, lng]);
    if (existing.rows[0]) {
      const row = await pool.query(`UPDATE incidents SET report_count = report_count + 1, severity = CASE WHEN $1 = 'HIGH' THEN 'HIGH' ELSE severity END WHERE id = $2 RETURNING *`, [incident.severity || 'MEDIUM', existing.rows[0].id]);
      return { incident: row.rows[0], duplicate: true };
    }
    const row = await pool.query(`INSERT INTO incidents (type, latitude, longitude, severity, lanes_blocked, description, source, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [type, lat, lng, incident.severity || 'MEDIUM', incident.lanesBlocked || 0, incident.description || '', incident.source || 'user', key]);
    return { incident: row.rows[0], duplicate: false };
  }
  return { incident: { id: Date.now(), type, latitude: lat, longitude: lng, severity: incident.severity || 'MEDIUM', lanesBlocked: incident.lanesBlocked || 0, status: 'ACTIVE', reportCount: 1 }, duplicate: false };
}

export function simulateClosure({ config, incident = {}, origin, destination }) {
  const base = getDemoTraffic(config, 15);
  const affected = base.filter((p) => p.segmentId === Number(incident.roadSegmentId) || p.riskLevel === 'HIGH').map((p) => p.name);
  const normalEta = 18.4;
  const diversionEta = normalEta + 3.8 + (Number(incident.lanesBlocked) || 1) * 1.6;
  return { origin, destination, affectedRoads: affected, severity: incident.severity || 'HIGH', diversion: { etaMin: Number(diversionEta.toFixed(1)), delayMin: Number((diversionEta - normalEta).toFixed(1)), recommendation: affected.length ? 'Use the alternate corridor shown on the map.' : 'No significant network impact detected.' } };
}

export function optimizeSignal({ approaches = {}, phases = [] }) {
  const entries = Object.entries(approaches);
  const total = entries.reduce((sum, [, value]) => sum + Number(value.vehicleCount || value.arrivalRate || 0), 0) || 1;
  const optimized = phases.length ? phases.map((phase) => ({ ...phase, greenSeconds: Math.max(10, Math.min(60, Math.round((phase.approaches || []).reduce((s, a) => s + Number(approaches[a]?.vehicleCount || approaches[a]?.arrivalRate || 0), 0) / total * 90))) })) : entries.map(([direction, value]) => ({ direction, greenSeconds: Math.max(10, Math.round((Number(value.vehicleCount || value.arrivalRate || 0) / total) * 90)) }));
  const before = Number(approaches.averageWaitSeconds || 74);
  const after = Math.max(18, Math.round(before * (0.62 - Math.min(0.12, entries.length * 0.01))));
  return { optimizedPhases: optimized, before: { averageWaitSeconds: before, maximumQueue: Number(approaches.maximumQueue || 29) }, after: { averageWaitSeconds: after, maximumQueue: Math.max(5, Math.round(Number(approaches.maximumQueue || 29) * 0.64)) }, improvementPercent: Number(((before - after) / before * 100).toFixed(1)) };
}

export async function getEmergencyRoute({ config, origin, destination }) {
  const normal = await getRoute(origin, destination, { config });
  const priority = { ...normal, durationMin: Number(Math.max(1, normal.durationMin * 0.72).toFixed(1)) };
  return { normalRoute: normal, priorityRoute: priority, timeSavedMin: Number((normal.durationMin - priority.durationMin).toFixed(1)), junctionPriority: [{ junctionId: 'J-102', estimatedGreenExtensionSeconds: 18 }, { junctionId: 'J-118', estimatedGreenExtensionSeconds: 12 }], simulation: true };
}

export async function compareRoutes({ config, origin, destination }) {
  const base = await getRoute(origin, destination, { config });
  const routes = [base, { ...base, distanceKm: Number((base.distanceKm * 1.12).toFixed(2)), durationMin: Number((base.durationMin * 0.86).toFixed(1)) }, { ...base, distanceKm: Number((base.distanceKm * 0.92).toFixed(2)), durationMin: Number((base.durationMin * 1.18).toFixed(1)) }].map((route, index) => {
    const congestion = [0.64, 0.28, 0.48][index];
    const closurePenalty = [0.3, 0, 0.12][index];
    const fuelLitres = Number((route.distanceKm * 0.08).toFixed(2));
    const reliability = [0.74, 0.91, 0.82][index];
    const score = 0.3 * route.durationMin + 0.2 * route.distanceKm + congestion * 12 + closurePenalty * 10 + fuelLitres * 2 + (1 - reliability) * 8;
    return { ...route, id: `route-${index + 1}`, congestion, closurePenalty, fuelLitres, reliability, score: Number(score.toFixed(2)), recommended: false, reasons: [`ETA ${route.durationMin} min`, `${Math.round(congestion * 100)}% congestion`, `${fuelLitres} L estimated fuel`, `${Math.round(reliability * 100)}% reliability`] };
  });
  routes.sort((a, b) => a.score - b.score); routes[0].recommended = true;
  return { recommendedRouteId: routes[0].id, routes };
}
