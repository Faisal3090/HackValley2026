import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api.js';
import { useAuth } from '../auth.jsx';
import DecisionPanel from '../components/DecisionPanel.jsx';
import EventTimeline from '../components/EventTimeline.jsx';
import FeatureFlagBadge from '../components/FeatureFlagBadge.jsx';
import MapView from '../components/MapView.jsx';
import { emitDispatchReset } from '../hooks/useDispatchToastNotifications.js';

export default function DemoPanel() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedRideIdParam = searchParams.get('rideId');
  const [devConfig, setDevConfig] = useState(null);
  const [ridesList, setRidesList] = useState([]);
  const [liveVehicles, setLiveVehicles] = useState([]);
  const [liveActiveRides, setLiveActiveRides] = useState([]);
  const [liveSummary, setLiveSummary] = useState(null);
  const [mapScope, setMapScope] = useState('fleet');
  const [selectedRideId, setSelectedRideId] = useState(() => {
    const parsed = Number(requestedRideIdParam);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [ride, setRide] = useState(null);
  const [events, setEvents] = useState([]);
  const [route, setRoute] = useState(null);
  const [simFeedback, setSimFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  const lastRouteKeyRef = useRef('');

  useEffect(() => {
    const parsed = Number(requestedRideIdParam);
    if (Number.isInteger(parsed) && parsed > 0) {
      setSelectedRideId(parsed);
    }
  }, [requestedRideIdParam]);

  useEffect(() => {
    apiRequest('/dev/config')
      .then((cfg) => setDevConfig(cfg))
      .catch(() => {});
  }, []);

  const fetchRidesList = useCallback(async () => {
    if (!token) return;
    try {
      let data;
      try {
        data = await apiRequest('/dev/rides', { token });
      } catch {
        data = await apiRequest('/rides/history', { token });
      }
      const list = data.rides || [];
      setRidesList(list);
      setSelectedRideId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      // Ignore
    }
  }, [token]);

  const fetchLiveFleet = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest('/drivers/live', { token });
      setLiveVehicles(data.vehicles || []);
      setLiveActiveRides(data.activeRides || []);
      setLiveSummary(data.summary || null);
    } catch {
      // Ignore transient polling failures
    }
  }, [token]);

  useEffect(() => {
    void fetchRidesList();
    void fetchLiveFleet();
    const timer = setInterval(() => {
      void fetchRidesList();
      void fetchLiveFleet();
    }, 1500);
    return () => clearInterval(timer);
  }, [fetchRidesList, fetchLiveFleet]);

  const fetchRideAndEvents = useCallback(async () => {
    if (!token || !selectedRideId) {
      setRide(null);
      setEvents([]);
      return;
    }
    try {
      const [rideRes, eventsRes] = await Promise.all([
        apiRequest(`/rides/${selectedRideId}`, { token }),
        apiRequest(`/rides/${selectedRideId}/events`, { token }),
      ]);
      setRide(rideRes);
      setEvents(eventsRes.events || []);
    } catch {
      // Ignore transient poll errors
    }
  }, [token, selectedRideId]);

  useEffect(() => {
    void fetchRideAndEvents();
    const timer = setInterval(() => void fetchRideAndEvents(), 1500);
    return () => clearInterval(timer);
  }, [fetchRideAndEvents]);

  useEffect(() => {
    if (!token || !ride) {
      lastRouteKeyRef.current = '';
      setRoute(null);
      return;
    }
    const key = `${ride.id}:${ride.status}:${ride.currentOffer?.driverId ?? ''}:${ride.currentDriver?.id ?? ''}`;
    if (lastRouteKeyRef.current === key) return;
    lastRouteKeyRef.current = key;

    apiRequest(`/rides/${ride.id}/route`, { token })
      .then((data) => setRoute(data))
      .catch(() => {});
  }, [token, ride]);

  const simulateOfferAction = async (offerId, action, label) => {
    setBusy(true);
    setSimFeedback(null);
    try {
      await apiRequest(`/offers/${offerId}/respond`, {
        method: 'POST',
        token,
        body: { action },
      });
      setSimFeedback({
        type: 'success',
        text: `${label}: Offer #${offerId} ${action}ed successfully.`,
      });
      await Promise.all([fetchRideAndEvents(), fetchLiveFleet()]);
    } catch (err) {
      setSimFeedback({
        type: err.status === 409 ? 'warning' : 'error',
        text: `${label} (HTTP ${err.status}): ${err.message}`,
      });
      await Promise.all([fetchRideAndEvents(), fetchLiveFleet()]);
    } finally {
      setBusy(false);
    }
  };

  const handleResetDemo = async () => {
    setBusy(true);
    setSimFeedback(null);
    try {
      await apiRequest('/dev/reset', { method: 'POST', token });
      emitDispatchReset();
      setSelectedRideId(null);
      setRide(null);
      setEvents([]);
      setSimFeedback({
        type: 'success',
        text: 'Demo database reset to initial 10 drivers and 3 passengers.',
      });
      await Promise.all([fetchRidesList(), fetchLiveFleet()]);
    } catch (err) {
      setSimFeedback({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (devConfig && !devConfig.demoMode) {
    return (
      <div className="page-container">
        <div className="alert alert-warning">
          DemoPanel is disabled because <code>DEMO_MODE=false</code>.
        </div>
      </div>
    );
  }

  const rankedDrivers = (ride?.latestRanking || []).map((r) => ({
    id: r.driverId,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    vehicleType: r.vehicleType,
    distanceKm: r.distanceKm,
    etaMin: r.etaMin,
    status: 'AVAILABLE',
  }));

  const mapDrivers = mapScope === 'fleet' && liveVehicles.length > 0 ? liveVehicles : rankedDrivers;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatch Inspector &amp; Live Fleet Dashboard</h1>
          <p className="page-subtitle">
            Monitor live vehicle locations, inspect candidate rankings, and simulate offer accept, reject, expiry, and late responses.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <FeatureFlagBadge config={devConfig} />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void handleResetDemo()}
          >
            Reset Demo Data
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div className="ride-picker-row">
            <label htmlFor="ridePicker" className="form-label" style={{ margin: 0 }}>
              Inspect Ride:
            </label>
            <select
              id="ridePicker"
              className="select ride-picker-select"
              value={selectedRideId ?? ''}
              onChange={(e) => setSelectedRideId(e.target.value ? Number(e.target.value) : null)}
            >
              {ridesList.length === 0 && <option value="">No rides yet</option>}
              {ridesList.map((r) => (
                <option key={r.id} value={r.id}>
                  Ride #{r.id} · {r.status} · {r.pickupLabel || 'Pickup'} → {r.dropLabel || 'Drop'}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-success btn-sm"
              disabled={busy || !ride?.currentOffer}
              onClick={() =>
                void simulateOfferAction(ride.currentOffer.id, 'accept', 'Driver accepts')
              }
            >
              Driver Accepts
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy || !ride?.currentOffer}
              onClick={() =>
                void simulateOfferAction(ride.currentOffer.id, 'reject', 'Driver rejects')
              }
            >
              Driver Rejects
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!ride?.currentOffer}
              onClick={() =>
                setSimFeedback({
                  type: 'info',
                  text: `Ignoring Offer #${ride.currentOffer.id}: worker expires it in ~${ride.currentOffer.secondsLeft}s.`,
                })
              }
            >
              Ignore (Let Expire)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || !ride?.lastExpiredOfferId}
              onClick={() =>
                void simulateOfferAction(ride.lastExpiredOfferId, 'accept', 'Late accept')
              }
            >
              Late Accept {ride?.lastExpiredOfferId ? `(#${ride.lastExpiredOfferId})` : ''}
            </button>
          </div>
        </div>

        {simFeedback && (
          <div className={`alert alert-${simFeedback.type}`} style={{ marginTop: '12px' }}>
            {simFeedback.text}
          </div>
        )}
      </div>

      <div className="demo-grid">
        <div className="panel-stack">
          <DecisionPanel ride={ride} />
          <EventTimeline events={events} />
        </div>

        <div className="panel-stack">
          <div className="panel" style={{ padding: '12px 16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div className="meta-row tabular">
                <span>
                  <strong>Live Map View</strong>
                </span>
                {liveSummary && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span style={{ color: 'var(--success)' }}>
                      {liveSummary.available} Available
                    </span>
                    <span aria-hidden="true">·</span>
                    <span style={{ color: '#218ce0' }}>
                      {liveSummary.busy} Busy
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{liveSummary.offline} Offline</span>
                  </>
                )}
              </div>

              <div className="segmented">
                <button
                  type="button"
                  className={mapScope === 'fleet' ? 'active' : ''}
                  onClick={() => setMapScope('fleet')}
                >
                  Live Fleet ({liveVehicles.length})
                </button>
                <button
                  type="button"
                  className={mapScope === 'ranked' ? 'active' : ''}
                  onClick={() => setMapScope('ranked')}
                >
                  Ride Candidates ({rankedDrivers.length})
                </button>
              </div>
            </div>
          </div>

          <MapView
            center={
              devConfig?.cityCenter
                ? [devConfig.cityCenter.lat, devConfig.cityCenter.lng]
                : [15.8497, 74.4977]
            }
            pickup={ride?.pickup ?? null}
            drop={ride?.drop ?? null}
            drivers={mapDrivers}
            activeRides={mapScope === 'fleet' ? liveActiveRides : []}
            selectedRideId={ride?.id ?? null}
            offeredDriverId={ride?.currentOffer?.driverId ?? null}
            assignedDriverId={ride?.currentDriver?.id ?? null}
            route={route}
            onSelectRide={(id) => setSelectedRideId(id)}
            showLegend
            instruction={
              ride
                ? `Ride #${ride.id} (${ride.status}) · ${mapScope === 'fleet' ? 'Live Fleet View' : 'Candidate View'}`
                : `Live Fleet View · ${liveVehicles.length} vehicles tracked`
            }
          />
        </div>
      </div>
    </div>
  );
}
