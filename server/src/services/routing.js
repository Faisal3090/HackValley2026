import config from '../config/index.js';
import { etaMinutes, haversineKm } from './geo.js';

const ROAD_FACTOR = 1.3;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_SIZE = 500;

const routeCache = new Map();
const matrixCache = new Map();

export function clearRoutingCache() {
  routeCache.clear();
  matrixCache.clear();
}

function roundCoord(val) {
  return Number(val).toFixed(4);
}

function getCached(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(cache, key, value) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function haversineRouteFallback(from, to, avgSpeedKmh) {
  const straightKm = haversineKm(from, to);
  const distanceKm = Number((straightKm * ROAD_FACTOR).toFixed(2));
  const durationMin = Number(etaMinutes(distanceKm, avgSpeedKmh).toFixed(1));
  return {
    distanceKm,
    durationMin,
    geometry: {
      type: 'LineString',
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
    source: 'haversine',
  };
}

function haversineMatrixFallback(drivers, pickup, avgSpeedKmh) {
  const result = {};
  for (const driver of drivers) {
    const straightKm = haversineKm(driver, pickup);
    const distanceKm = Number((straightKm * ROAD_FACTOR).toFixed(2));
    const etaMin = Number(etaMinutes(distanceKm, avgSpeedKmh).toFixed(1));
    result[driver.id] = { distanceKm, etaMin, source: 'haversine' };
  }
  return result;
}

async function fetchWithTimeout(url, timeoutMs, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`OSRM HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getRoute(from, to, opts = {}) {
  const cfg = opts.config ?? config;
  const fetchImpl = opts.fetchFn ?? globalThis.fetch;

  if (cfg.ROUTING_PROVIDER === 'haversine') {
    return haversineRouteFallback(from, to, cfg.AVG_SPEED_KMH);
  }

  const cacheKey = `${roundCoord(from.lat)},${roundCoord(from.lng)}->${roundCoord(to.lat)},${roundCoord(to.lng)}`;
  const cached = getCached(routeCache, cacheKey);
  if (cached) return cached;

  const url = `${cfg.OSRM_BASE_URL.replace(/\/$/, '')}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  try {
    const data = await fetchWithTimeout(url, cfg.ROUTING_TIMEOUT_MS, fetchImpl);
    const route = data?.routes?.[0];
    if (!route || typeof route.distance !== 'number' || typeof route.duration !== 'number') {
      throw new Error('Invalid OSRM route payload');
    }
    const result = {
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMin: Number((route.duration / 60).toFixed(1)),
      geometry: route.geometry,
      source: 'osrm',
    };
    setCached(routeCache, cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`Routing getRoute fallback to haversine: ${err.message}`);
    return haversineRouteFallback(from, to, cfg.AVG_SPEED_KMH);
  }
}

export async function getEtaMatrix(drivers, pickup, opts = {}) {
  if (!drivers || drivers.length === 0) return {};

  const cfg = opts.config ?? config;
  const fetchImpl = opts.fetchFn ?? globalThis.fetch;

  if (cfg.ROUTING_PROVIDER === 'haversine') {
    return haversineMatrixFallback(drivers, pickup, cfg.AVG_SPEED_KMH);
  }

  const driverCoordsKey = drivers
    .map((d) => `${d.id}:${roundCoord(d.lat)},${roundCoord(d.lng)}`)
    .join('|');
  const cacheKey = `${driverCoordsKey}->${roundCoord(pickup.lat)},${roundCoord(pickup.lng)}`;
  const cached = getCached(matrixCache, cacheKey);
  if (cached) return cached;

  const coords = [
    ...drivers.map((d) => `${d.lng},${d.lat}`),
    `${pickup.lng},${pickup.lat}`,
  ].join(';');
  const sources = drivers.map((_, i) => i).join(';');
  const destination = drivers.length;
  const url = `${cfg.OSRM_BASE_URL.replace(/\/$/, '')}/table/v1/driving/${coords}?sources=${sources}&destinations=${destination}&annotations=distance,duration`;

  try {
    const data = await fetchWithTimeout(url, cfg.ROUTING_TIMEOUT_MS, fetchImpl);
    if (
      !Array.isArray(data?.distances) ||
      !Array.isArray(data?.durations) ||
      data.distances.length !== drivers.length
    ) {
      throw new Error('Invalid OSRM table payload');
    }

    const result = {};
    for (let i = 0; i < drivers.length; i += 1) {
      const driver = drivers[i];
      const distMeters = data.distances[i]?.[0];
      const durSeconds = data.durations[i]?.[0];
      if (typeof distMeters === 'number' && typeof durSeconds === 'number') {
        result[driver.id] = {
          distanceKm: Number((distMeters / 1000).toFixed(2)),
          etaMin: Number((durSeconds / 60).toFixed(1)),
          source: 'osrm',
        };
      } else {
        const fallback = haversineMatrixFallback([driver], pickup, cfg.AVG_SPEED_KMH);
        result[driver.id] = fallback[driver.id];
      }
    }
    setCached(matrixCache, cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`Routing getEtaMatrix fallback to haversine: ${err.message}`);
    return haversineMatrixFallback(drivers, pickup, cfg.AVG_SPEED_KMH);
  }
}
