import config from '../config/index.js';

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function getLatLng(point) {
  return {
    lat: point.lat ?? point.latitude,
    lng: point.lng ?? point.longitude,
  };
}

export function haversineKm(a, b) {
  const p1 = getLatLng(a);
  const p2 = getLatLng(b);
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

export function etaMinutes(distanceKm, avgSpeedKmh = config.AVG_SPEED_KMH) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return (distanceKm / avgSpeedKmh) * 60;
}
