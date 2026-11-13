import { describe, expect, it, vi } from 'vitest';
import { calculateEarnings, completeEarnings, estimateEarnings } from '../src/services/earnings.js';

const input = { fare: 300, pickupDistanceKm: 2, passengerDistanceKm: 10, emptyReturnDistanceKm: 3, fuelCostPerKm: 5, maintenanceCostPerKm: 1, commissionPercent: 20 };
describe('Expense-aware earnings', () => {
  it('charges fuel and maintenance on all legs and commission on fare', () => {
    expect(calculateEarnings(input)).toMatchObject({ totalDistanceKm: 15, fuelExpense: 75, maintenanceExpense: 15, commission: 60, totalExpenses: 150, netProfit: 150 });
  });
  it('preserves losses and supports explicit zero costs', () => {
    expect(calculateEarnings({ ...input, fare: 50 }).netProfit).toBe(-50);
    expect(calculateEarnings({ ...input, fuelCostPerKm: 0, maintenanceCostPerKm: 0, commissionPercent: 0 }).netProfit).toBe(300);
  });
  it.each([null, undefined, NaN, Infinity, -1])('does not turn missing or invalid distances into profit: %s', (distance) => {
    expect(calculateEarnings({ ...input, pickupDistanceKm: distance }).available).toBe(false);
  });
  it('does not silently assume unknown vehicle costs are zero', () => {
    expect(calculateEarnings({ ...input, fuelCostPerKm: null }).available).toBe(false);
  });
  it('updates actual passenger distance without changing saved costs or return estimate', () => {
    const updated = completeEarnings(calculateEarnings(input), 300, 12);
    expect(updated).toMatchObject({ passengerDistanceKm: 12, totalDistanceKm: 17, netProfit: 138, emptyReturnEstimated: true, passengerDistanceBasis: 'driver-reported actual' });
    expect(completeEarnings(calculateEarnings(input), 300, null).passengerDistanceKm).toBe(10);
  });
  const ride = { pickup_lat: 1, pickup_lng: 1, drop_lat: 2, drop_lng: 2, estimated_fare: 300 };
  const driver = { lat: 0, lng: 0, base_lat: 3, base_lng: 3, fuel_cost_per_km: 5, maintenance_cost_per_km: 1 };
  const cfg = { DRIVER_PAYOUT_PERCENT: 0.8, EARNINGS_DEMAND_ZONES: [] };
  it('uses home/base when no demand zones are configured and labels fallback distances', async () => {
    const result = await estimateEarnings(ride, driver, cfg, async () => ({ distanceKm: 5, source: 'haversine' }));
    expect(result).toMatchObject({ available: true, returnDestination: 'Home/base', returnSource: 'haversine', emptyReturnDistanceKm: 5, commissionPercent: 20 });
  });
  it('selects the closest configured zone by road distance', async () => {
    const result = await estimateEarnings(ride, driver, { ...cfg, EARNINGS_DEMAND_ZONES: [{ name: 'Far', lat: 8, lng: 8 }, { name: 'Near', lat: 4, lng: 4 }] },
      async (_from, to) => ({ distanceKm: to.lat, source: 'osrm' }));
    expect(result.returnDestination).toBe('Near');
    expect(result.emptyReturnDistanceKm).toBe(4);
  });
  it('withholds profit on routing failure or missing return destination', async () => {
    expect((await estimateEarnings(ride, driver, cfg, vi.fn().mockRejectedValue(new Error('offline')))).available).toBe(false);
    expect((await estimateEarnings(ride, { ...driver, base_lat: null, base_lng: null }, cfg, async () => ({ distanceKm: 5 }))).available).toBe(false);
  });
});
