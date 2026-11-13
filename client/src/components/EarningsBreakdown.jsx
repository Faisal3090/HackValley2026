import React from 'react';

const money = (value) => `₹${Number(value).toFixed(2)}`;
export default function EarningsBreakdown({ earnings }) {
  if (!earnings) return null;
  if (!earnings.available) return <p role="status">Profit estimate unavailable. {earnings.reason}</p>;
  const rows = [
    ['Passenger fare', money(earnings.fare)],
    ['Pickup distance (estimated)', `${earnings.pickupDistanceKm} km`],
    [`Passenger distance (${earnings.passengerDistanceBasis})`, `${earnings.passengerDistanceKm} km`],
    [`Empty return (estimated) to ${earnings.returnDestination}`, `${earnings.emptyReturnDistanceKm} km`],
    ['Total distance', `${earnings.totalDistanceKm} km`],
    [`Fuel (${money(earnings.fuelCostPerKm)}/km)`, money(earnings.fuelExpense)],
    [`Maintenance (${money(earnings.maintenanceCostPerKm)}/km)`, money(earnings.maintenanceExpense)],
    [`Platform commission (${earnings.commissionPercent}%)`, money(earnings.commission)],
    ['Total estimated expenses', money(earnings.totalExpenses)],
  ];
  return <details style={{ margin: '12px 0' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700, color: earnings.netProfit < 0 ? 'var(--danger)' : 'var(--ink)' }}>
      Estimated net profit: {money(earnings.netProfit)}{earnings.netProfit < 0 ? ' (estimated loss)' : ''}
    </summary>
    <dl>{rows.map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 8 }}>
      <dt>{label}</dt><dd className="tabular" style={{ margin: 0 }}>{value}</dd>
    </div>)}</dl>
    <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Operating costs and empty return remain estimates, not guaranteed take-home earnings.
      {[earnings.pickupSource, earnings.passengerSource, earnings.returnSource].includes('haversine') && ' Some distances use an approximate road-factor fallback.'}
    </p>
  </details>;
}
