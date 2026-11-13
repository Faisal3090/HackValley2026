export function notHoldingPendingOffer(driver) {
  return !driver.hasPendingOffer;
}

export function notAlreadyOfferedThisRide(driver) {
  return !driver.alreadyOfferedThisRide;
}

export function vehicleTypeMatches(driver, ride) {
  const requested = ride?.vehicle_type ?? ride?.vehicleType;
  if (!requested) return true;
  return driver.vehicleType === requested;
}

export function heartbeatFresh(driver, _ride, ctx) {
  const threshold = ctx?.config?.STALE_HEARTBEAT_SECONDS ?? 0;
  if (!threshold || threshold <= 0) return true;
  if (!driver.lastHeartbeat) return true;
  const nowMs = (ctx?.now ?? new Date()).getTime();
  const hbMs = new Date(driver.lastHeartbeat).getTime();
  return (nowMs - hbMs) / 1000 <= threshold;
}

export const eligibilityRules = [
  notHoldingPendingOffer,
  notAlreadyOfferedThisRide,
  vehicleTypeMatches,
  heartbeatFresh,
];
