import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import { calculateFare } from '../src/services/fare.js';

const config = loadConfig({
  DRIVER_PAYOUT_PERCENT: '0.8',
  FARE_MULTIPLIER_MIN: '0.5',
  FARE_MULTIPLIER_MAX: '2.0',
});

describe('vehicle fare calculation', () => {
  it('uses the AUTO base fare below its included distance', () => {
    const fare = calculateFare({ tripDistanceKm: 1, vehicleType: 'AUTO', cfg: config });
    expect(fare.total).toBe(37);
    expect(fare.breakdown.billableKm).toBe(0);
  });

  it('charges AUTO distance beyond 1.6 km', () => {
    const fare = calculateFare({ tripDistanceKm: 2.6, vehicleType: 'AUTO', cfg: config });
    expect(fare.total).toBe(52);
    expect(fare.breakdown.billableKm).toBe(1);
  });

  it('does not charge HATCHBACK distance at its 4 km inclusion', () => {
    const fare = calculateFare({ tripDistanceKm: 4, vehicleType: 'HATCHBACK', cfg: config });
    expect(fare.total).toBe(100);
    expect(fare.breakdown.billableKm).toBe(0);
  });

  it('charges HATCHBACK distance beyond 4 km', () => {
    const fare = calculateFare({ tripDistanceKm: 6, vehicleType: 'HATCHBACK', cfg: config });
    expect(fare.total).toBe(148);
    expect(fare.breakdown.billableKm).toBe(2);
  });

  it('calculates SEDAN fare', () => {
    expect(calculateFare({ tripDistanceKm: 6, vehicleType: 'SEDAN', cfg: config }).total).toBe(171);
  });

  it('calculates SUV fare', () => {
    expect(calculateFare({ tripDistanceKm: 6, vehicleType: 'SUV', cfg: config }).total).toBe(194);
  });

  it('clamps the combined multiplier to the configured minimum', () => {
    const fare = calculateFare({
      tripDistanceKm: 6,
      vehicleType: 'HATCHBACK',
      zone: { surgeMultiplier: 0.1 },
      cfg: config,
    });
    expect(fare.total).toBe(74);
    expect(fare.breakdown.appliedMultiplier).toBe(0.5);
  });

  it('clamps the combined multiplier to the configured maximum', () => {
    const fare = calculateFare({
      tripDistanceKm: 6,
      vehicleType: 'HATCHBACK',
      zone: { surgeMultiplier: 3 },
      cfg: config,
    });
    expect(fare.total).toBe(296);
    expect(fare.breakdown.appliedMultiplier).toBe(2);
  });

  it('calculates driver payout as 80 percent of final fare', () => {
    const fare = calculateFare({ tripDistanceKm: 6, vehicleType: 'HATCHBACK', cfg: config });
    expect(fare.driverPayout).toBe(118);
    expect(fare.breakdown.driverPayout).toBe(118);
  });

  it('calculates platform fee as the balance after driver payout', () => {
    const fare = calculateFare({ tripDistanceKm: 6, vehicleType: 'HATCHBACK', cfg: config });
    expect(fare.platformFee).toBe(30);
    expect(fare.platformFee).toBe(fare.total - fare.driverPayout);
  });

  it('rejects BIKE as an unsupported fare vehicle type', () => {
    expect(() => calculateFare({ tripDistanceKm: 6, vehicleType: 'BIKE', cfg: config })).toThrow(
      'Unsupported vehicle type'
    );
  });

  it('preserves existing fare result fields and adds payout details', () => {
    const fare = calculateFare({ tripDistanceKm: 6, vehicleType: 'HATCHBACK', cfg: config });
    expect(fare).toMatchObject({
      total: 148,
      driverPayout: 118,
      platformFee: 30,
      breakdown: {
        vehicleType: 'HATCHBACK',
        baseFare: 100,
        includedDistanceKm: 4,
        tripDistanceKm: 6,
        billableKm: 2,
        perKmRate: 24,
        regulatedFare: 148,
        appliedMultiplier: 1,
        finalFare: 148,
        driverPayout: 118,
        platformFee: 30,
        total: 148,
      },
    });
    expect(fare.breakdown).toHaveProperty('subtotal');
    expect(fare.breakdown).toHaveProperty('modifiers');
  });
});
