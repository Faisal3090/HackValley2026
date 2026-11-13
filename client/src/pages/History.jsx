import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../auth.jsx';
import EarningsBreakdown from '../components/EarningsBreakdown.jsx';

export default function History() {
  const { token, user } = useAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiRequest('/rides/history', { token })
      .then((data) => setRides(data.rides || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const totalEarnings = rides
    .filter((r) => r.status === 'COMPLETED')
    .reduce((sum, r) => sum + (Number(r.finalFare ?? r.estimatedFare) || 0), 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ride History</h1>
          <p className="page-subtitle">
            Completed, active, cancelled, and unfulfilled rides with itemized fares.
          </p>
        </div>

        {user?.role === 'driver' && (
          <div className="panel" style={{ padding: '12px 18px' }}>
            <div className="kv-label">Total Completed Earnings</div>
            <div className="kv-value tabular">₹{totalEarnings}</div>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div className="panel">
        {loading ? (
          <p style={{ margin: 0, color: 'var(--ink-muted)' }}>Loading ride history...</p>
        ) : rides.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
            No rides recorded yet.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ride</th>
                  <th>Date</th>
                  <th>Route</th>
                  <th>{user?.role === 'driver' ? 'Passenger' : 'Driver'}</th>
                  <th>Status</th>
                  <th className="num">Distance</th>
                  <th className="num">Est. Fare</th>
                  <th className="num">Final Fare</th>
                  {user?.role === 'driver' && <th>Estimated net profit</th>}
                </tr>
              </thead>
              <tbody>
                {rides.map((r) => {
                  const pickupText =
                    r.pickupLabel || `${r.pickupLat.toFixed(3)}, ${r.pickupLng.toFixed(3)}`;
                  const dropText =
                    r.dropLabel || `${r.dropLat.toFixed(3)}, ${r.dropLng.toFixed(3)}`;
                  return (
                    <tr key={r.id}>
                      <td className="tabular">#{r.id}</td>
                      <td className="tabular">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td>
                        {pickupText} → {dropText}
                      </td>
                      <td>
                        {user?.role === 'driver'
                          ? r.passengerName
                          : r.driverName || '—'}
                      </td>
                      <td>
                        <strong>{r.status}</strong>
                      </td>
                      <td className="num">
                        {r.tripDistanceKm != null ? `${r.tripDistanceKm} km` : '—'}
                      </td>
                      <td className="num">
                        {r.estimatedFare != null ? `₹${r.estimatedFare}` : '—'}
                      </td>
                      <td className="num">
                        <strong>
                          {r.finalFare != null ? `₹${r.finalFare}` : '—'}
                        </strong>
                      </td>
                      {user?.role === 'driver' && <td>{r.earnings ? <EarningsBreakdown earnings={r.earnings} /> : 'No saved estimate'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
