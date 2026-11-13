import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import { useAuth } from '../auth.jsx';
import MapView from '../components/MapView.jsx';

export default function LiveMap() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedRideIdParam = searchParams.get('rideId');
  const [cityCenter, setCityCenter] = useState([15.8497, 74.4977]);
  const [vehicles, setVehicles] = useState([]);
  const [activeRides, setActiveRides] = useState([]);
  const [summary, setSummary] = useState({
    totalVehicles: 0,
    available: 0,
    busy: 0,
    offline: 0,
    activeRides: 0,
  });
  const [updatedAt, setUpdatedAt] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vehicleFilter, setVehicleFilter] = useState('ALL');

  const [selectedRideId, setSelectedRideId] = useState(() => {
    const parsed = Number(requestedRideIdParam);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [route, setRoute] = useState(null);
  const [focusPoint, setFocusPoint] = useState(null);
  const [error, setError] = useState('');

  const lastRouteKeyRef = useRef('');

  useEffect(() => {
    const parsed = Number(requestedRideIdParam);
    if (Number.isInteger(parsed) && parsed > 0) {
      setSelectedRideId(parsed);
    }
  }, [requestedRideIdParam]);

  useEffect(() => {
    apiRequest('/dev/config')
      .then((cfg) => {
        if (cfg?.cityCenter) {
          setCityCenter([cfg.cityCenter.lat, cfg.cityCenter.lng]);
        }
      })
      .catch(() => {});
  }, []);

  const fetchLive = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest('/drivers/live', { token });
      setVehicles(data.vehicles || []);
      const rides = data.activeRides || [];
      setActiveRides(rides);
      setSummary(
        data.summary || {
          totalVehicles: (data.vehicles || []).length,
          available: 0,
          busy: 0,
          offline: 0,
          activeRides: rides.length,
        }
      );
      setUpdatedAt(data.updatedAt || new Date().toISOString());
      setError('');
      setSelectedRideId((prev) => {
        if (prev && rides.some((r) => r.id === prev)) return prev;
        return rides[0]?.id ?? null;
      });
    } catch (err) {
      setError(err.message || 'Unable to load live vehicle positions');
    }
  }, [token]);

  useEffect(() => {
    void fetchLive();
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => void fetchLive(), 1500);
    return () => clearInterval(timer);
  }, [fetchLive, autoRefresh]);

  const selectedRide =
    activeRides.find((r) => Number(r.id) === Number(selectedRideId)) || null;

  useEffect(() => {
    if (!token || !selectedRide) {
      lastRouteKeyRef.current = '';
      setRoute(null);
      return;
    }
    const key = `${selectedRide.id}:${selectedRide.status}:${selectedRide.offeredDriverId ?? ''}:${selectedRide.currentDriverId ?? ''}`;
    if (lastRouteKeyRef.current === key) return;
    lastRouteKeyRef.current = key;

    apiRequest(`/rides/${selectedRide.id}/route`, { token })
      .then((data) => setRoute(data))
      .catch(() => {});
  }, [token, selectedRide]);

  const filteredVehicles = vehicles.filter((v) => {
    if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
    if (vehicleFilter !== 'ALL' && v.vehicleType !== vehicleFilter) return false;
    return true;
  });

  const handleSelectRide = (rideId) => {
    setSelectedRideId(rideId);
    const target = activeRides.find((r) => Number(r.id) === Number(rideId));
    if (target?.pickup) {
      setFocusPoint({ lat: target.pickup.lat, lng: target.pickup.lng, nonce: Date.now() });
    }
  };

  const handleSelectVehicle = (v) => {
    setSelectedDriverId(v.id);
    if (v.lat != null && v.lng != null) {
      setFocusPoint({ lat: v.lat, lng: v.lng, nonce: Date.now() });
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Map View</h1>
          <p className="page-subtitle">
            Real-time vehicle locations and active ride requests across the city.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${autoRefresh ? 'btn-success' : ''}`}
            onClick={() => setAutoRefresh((prev) => !prev)}
          >
            {autoRefresh ? 'Live Polling: ON (1.5s)' : 'Live Polling: PAUSED'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void fetchLive()}
          >
            Refresh Now
          </button>
          {updatedAt && (
            <span className="tabular" style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
              Updated {new Date(updatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div className="fleet-kpi-grid" style={{ marginBottom: '18px' }}>
        <div className="kv-item">
          <div className="kv-label">Total Fleet</div>
          <div className="kv-value tabular">{summary.totalVehicles}</div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Available</div>
          <div className="kv-value tabular" style={{ color: 'var(--success)' }}>
            {summary.available}
          </div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Busy on Ride</div>
          <div className="kv-value tabular" style={{ color: '#218ce0' }}>
            {summary.busy}
          </div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Offline</div>
          <div className="kv-value tabular" style={{ color: 'var(--ink-muted)' }}>
            {summary.offline}
          </div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Active Requests</div>
          <div className="kv-value tabular" style={{ color: 'var(--kasu-orange)' }}>
            {summary.activeRides}
          </div>
        </div>
      </div>

      <div className="split-grid">
        <div className="panel-stack">
          <div className="panel">
            <h2 className="panel-title">Active Ride Requests ({activeRides.length})</h2>
            {activeRides.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
                No active ride requests right now. Book a ride from Passenger view to watch live dispatch.
              </p>
            ) : (
              <div className="driver-list" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {activeRides.map((r) => {
                  const isSelected = Number(r.id) === Number(selectedRideId);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`driver-row interactive-row ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => handleSelectRide(r.id)}
                    >
                      <div style={{ textAlign: 'left', minWidth: 0 }}>
                        <div>
                          <strong>Ride #{r.id}</strong> · <span>{r.status}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                          {r.pickup?.label || 'Pickup'} → {r.drop?.label || 'Drop'}
                        </div>
                        <div className="meta-row" style={{ fontSize: '12px', marginTop: '2px' }}>
                          <span>{r.passengerName}</span>
                          {r.offeredDriverId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular">
                                Offered D{r.offeredDriverId} ({r.offerSecondsLeft}s)
                              </span>
                            </>
                          )}
                          {r.currentDriverId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular">Assigned D{r.currentDriverId}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="tabular" style={{ textAlign: 'right', fontSize: '14px', flexShrink: 0 }}>
                        {r.estimatedFare != null && <strong>₹{r.estimatedFare}</strong>}
                        {r.tripDistanceKm != null && (
                          <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                            {r.tripDistanceKm} km
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              <h2 className="panel-title" style={{ margin: 0 }}>
                Vehicles ({filteredVehicles.length})
              </h2>
              <select
                aria-label="Filter by vehicle type"
                className="select"
                style={{ width: 'auto', minHeight: '36px', padding: '6px 10px' }}
                value={vehicleFilter}
                onChange={(e) => setVehicleFilter(e.target.value)}
              >
                <option value="ALL">All Types</option>
                <option value="AUTO">AUTO</option>
                <option value="HATCHBACK">HATCHBACK</option>
                <option value="SEDAN">SEDAN</option>
                <option value="SUV">SUV</option>
              </select>
            </div>

            <div className="segmented" style={{ marginBottom: '12px', width: '100%' }}>
              {['ALL', 'AVAILABLE', 'BUSY', 'OFFLINE'].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={statusFilter === status ? 'active' : ''}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'ALL' ? 'All' : status[0] + status.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {filteredVehicles.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
                No vehicles match the selected filter.
              </p>
            ) : (
              <div className="driver-list" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {filteredVehicles.map((v) => {
                  const isFocused = Number(v.id) === Number(selectedDriverId);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`driver-row interactive-row ${isFocused ? 'is-selected' : ''}`}
                      onClick={() => handleSelectVehicle(v)}
                    >
                      <div style={{ textAlign: 'left', minWidth: 0 }}>
                        <div>
                          <strong>
                            D{v.id} · {v.name}
                          </strong>
                        </div>
                        <div className="meta-row" style={{ fontSize: '12px' }}>
                          <span>{v.vehicleType}</span>
                          <span aria-hidden="true">·</span>
                          <span>{v.vehicleNumber}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular">
                            {v.lat != null ? `${Number(v.lat).toFixed(4)}, ${Number(v.lng).toFixed(4)}` : 'No GPS'}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color:
                              v.status === 'AVAILABLE'
                                ? 'var(--success)'
                                : v.status === 'BUSY'
                                ? '#218ce0'
                                : 'var(--ink-muted)',
                          }}
                        >
                          {v.status}
                        </div>
                        {v.activeRide ? (
                          <div className="tabular" style={{ fontSize: '12px', color: 'var(--warning)' }}>
                            Ride #{v.activeRide.id} ({v.activeRide.relation})
                          </div>
                        ) : (
                          <div className="tabular" style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                            {v.ridesCompleted} trips
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <MapView
          center={cityCenter}
          pickup={selectedRide?.pickup ?? null}
          drop={selectedRide?.drop ?? null}
          drivers={filteredVehicles}
          activeRides={activeRides}
          selectedRideId={selectedRide?.id ?? null}
          offeredDriverId={selectedRide?.offeredDriverId ?? null}
          assignedDriverId={selectedRide?.currentDriverId ?? null}
          route={route}
          focusPoint={focusPoint}
          onSelectDriver={handleSelectVehicle}
          onSelectRide={handleSelectRide}
          showLegend
          instruction={
            selectedRide
              ? `Live Map · Ride #${selectedRide.id} (${selectedRide.status}) · ${filteredVehicles.length} vehicles shown`
              : `Live Map · Showing ${filteredVehicles.length} fleet vehicles`
          }
        />
      </div>
    </div>
  );
}
