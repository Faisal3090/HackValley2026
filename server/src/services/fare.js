import config from '../config/index.js';
import { fareModifiers as defaultModifiers } from '../hooks/fareModifiers.js';

const VEHICLE_PRICING = Object.freeze({
  AUTO: { baseFare: 37, includedDistanceKm: 1.6, perKmRate: 15 },
  HATCHBACK: { baseFare: 100, includedDistanceKm: 4, perKmRate: 24 },
  SEDAN: { baseFare: 115, includedDistanceKm: 4, perKmRate: 28 },
  SUV: { baseFare: 130, includedDistanceKm: 4, perKmRate: 32 },
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateFare({
  tripDistanceKm,
  vehicleType = 'HATCHBACK',
  zone = null,
  modifiers = defaultModifiers,
  cfg = config,
}) {
  const normalizedType = vehicleType || 'HATCHBACK';
  const pricing = VEHICLE_PRICING[normalizedType];
  if (!pricing) {
    throw new TypeError(`Unsupported vehicle type for fare calculation: ${normalizedType}`);
  }

  const distanceKm = Math.max(0, Number(tripDistanceKm) || 0);
  const billableKm = Math.max(0, distanceKm - pricing.includedDistanceKm);
  const distanceCharge = pricing.perKmRate * billableKm;
  const regulatedFare = pricing.baseFare + distanceCharge;

  const appliedModifiers = [];
  let combinedMultiplier = 1;
  const ctx = { tripDistanceKm: distanceKm, vehicleType: normalizedType, zone, config: cfg };

  for (const mod of modifiers) {
    const runningFare = regulatedFare * combinedMultiplier;
    const res = mod(runningFare, ctx);
    const modifiedFare = typeof res === 'number' ? res : res?.fare;
    const modifierMultiplier =
      typeof res?.multiplier === 'number'
        ? res.multiplier
        : typeof modifiedFare === 'number'
        ? modifiedFare / runningFare
        : null;
    if (modifierMultiplier === null) continue;
    if (!Number.isFinite(modifierMultiplier)) {
      throw new TypeError(`Fare modifier "${mod.name || 'modifier'}" returned an invalid multiplier`);
    }

    combinedMultiplier *= modifierMultiplier;
    if (!Number.isFinite(combinedMultiplier)) {
      throw new TypeError(`Fare modifier "${mod.name || 'modifier'}" returned an invalid multiplier`);
    }
    appliedModifiers.push({
      name: res?.label || mod.name || 'modifier',
      multiplier: modifierMultiplier,
      before: Number(runningFare.toFixed(2)),
      after: Number((regulatedFare * combinedMultiplier).toFixed(2)),
    });
  }

  const minimumMultiplier = cfg.FARE_MULTIPLIER_MIN ?? 0.5;
  const maximumMultiplier = cfg.FARE_MULTIPLIER_MAX ?? 2.0;
  const appliedMultiplier = clamp(combinedMultiplier, minimumMultiplier, maximumMultiplier);
  const total = Math.round(regulatedFare * appliedMultiplier);
  const driverPayout = Math.round(total * (cfg.DRIVER_PAYOUT_PERCENT ?? 0.8));
  const platformFee = total - driverPayout;

  return {
    total,
    driverPayout,
    platformFee,
    currency: 'INR',
    breakdown: {
      currency: 'INR',
      vehicleType: normalizedType,
      baseFare: pricing.baseFare,
      includedDistanceKm: pricing.includedDistanceKm,
      tripDistanceKm: Number(distanceKm.toFixed(2)),
      billableKm: Number(billableKm.toFixed(2)),
      perKmRate: pricing.perKmRate,
      distanceCharge: Number(distanceCharge.toFixed(2)),
      regulatedFare: Number(regulatedFare.toFixed(2)),
      appliedMultiplier,
      vehicleMultiplier: appliedMultiplier,
      subtotal: Number(regulatedFare.toFixed(2)),
      modifiers: appliedModifiers,
      finalFare: total,
      driverPayout,
      platformFee,
      total,
    },
  };
}
