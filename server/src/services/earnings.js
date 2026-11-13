import { getRoute } from './routing.js';

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const valid = (n) => n != null && Number.isFinite(Number(n)) && Number(n) >= 0;
const point = (lat, lng) => lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
  ? { lat: Number(lat), lng: Number(lng) } : null;

export function calculateEarnings(input) {
  const keys = ['fare', 'pickupDistanceKm', 'passengerDistanceKm', 'emptyReturnDistanceKm', 'fuelCostPerKm', 'maintenanceCostPerKm', 'commissionPercent'];
  if (keys.some((key) => !valid(input[key])) || Number(input.commissionPercent) > 100) {
    return { ...input, available: false, reason: input.reason || 'Set vehicle costs and a home/base, and ensure route distances are available.' };
  }
  const values = Object.fromEntries(keys.map((key) => [key, Number(input[key])]));
  const totalDistanceKm = round(values.pickupDistanceKm + values.passengerDistanceKm + values.emptyReturnDistanceKm);
  const fuelExpense = round(totalDistanceKm * values.fuelCostPerKm);
  const maintenanceExpense = round(totalDistanceKm * values.maintenanceCostPerKm);
  const commission = round(values.fare * values.commissionPercent / 100);
  const totalExpenses = round(fuelExpense + maintenanceExpense + commission);
  return { ...input, ...values, available: true, totalDistanceKm, fuelExpense, maintenanceExpense, commission, totalExpenses, netProfit: round(values.fare - totalExpenses) };
}

// Routing already provides a labelled road-factor fallback if its provider fails.
export async function estimateEarnings(ride, driver, config, routeFn = getRoute) {
  const pickup = point(ride.pickup_lat, ride.pickup_lng);
  const drop = point(ride.drop_lat, ride.drop_lng);
  const origin = point(driver.lat, driver.lng);
  const base = point(driver.base_lat, driver.base_lng);
  const route = async (from, to) => {
    if (!from || !to) return null;
    try { return await routeFn(from, to, { config }); } catch { return null; }
  };
  const destinations = (config.EARNINGS_DEMAND_ZONES || []).map((zone) => ({ ...zone, kind: 'demand zone' }));
  if (!destinations.length && base) destinations.push({ ...base, name: 'Home/base', kind: 'home/base' });
  const [pickupRoute, passengerRoute, returnRoutes] = await Promise.all([
    route(origin, pickup), route(pickup, drop),
    Promise.all(destinations.map(async (destination) => ({ destination, route: await route(drop, destination) }))),
  ]);
  let best = returnRoutes.filter((r) => valid(r.route?.distanceKm)).sort((a, b) => a.route.distanceKm - b.route.distanceKm)[0];
  if (!best && base) best = { destination: { name: 'Home/base', kind: 'home/base' }, route: await route(drop, base) };
  return calculateEarnings({
    fare: ride.final_fare ?? ride.estimated_fare,
    pickupDistanceKm: pickupRoute?.distanceKm ?? null,
    passengerDistanceKm: passengerRoute?.distanceKm ?? null,
    emptyReturnDistanceKm: best?.route?.distanceKm ?? null,
    fuelCostPerKm: driver.fuel_cost_per_km ?? null,
    maintenanceCostPerKm: driver.maintenance_cost_per_km ?? null,
    commissionPercent: round((1 - config.DRIVER_PAYOUT_PERCENT) * 100),
    returnDestination: best?.destination?.name ?? null,
    pickupSource: pickupRoute?.source ?? 'unavailable',
    passengerSource: passengerRoute?.source ?? 'unavailable',
    returnSource: best?.route?.source ?? 'unavailable',
    passengerDistanceBasis: 'estimated route',
    emptyReturnEstimated: true,
  });
}

export function completeEarnings(snapshot, fare, actualDistanceKm) {
  if (!snapshot) return null;
  return calculateEarnings({ ...snapshot, fare,
    passengerDistanceKm: actualDistanceKm ?? snapshot.passengerDistanceKm,
    passengerDistanceBasis: actualDistanceKm != null ? 'driver-reported actual' : snapshot.passengerDistanceBasis,
    emptyReturnEstimated: true,
  });
}
