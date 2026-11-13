import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../auth.jsx';
import MapView from '../components/MapView.jsx';
import OfferCard from '../components/OfferCard.jsx';
import RideStatusStepper from '../components/RideStatusStepper.jsx';

const NEXT_STEP_LABEL = {
  ACCEPTED: 'Start heading to pickup',
  ARRIVING: 'Start trip',
  ONGOING: 'Complete trip',
};

export default function DriverHome() {
  const { token, driver, setDriver } = useAuth();
  const [offer, setOffer] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationStep, setSimulationStep] = useState('');
  const [automaticDemo, setAutomaticDemo] = useState(false);
  const [heartbeatPaused, setHeartbeatPaused] = useState(false);
  const [offlineSeconds, setOfflineSeconds] = useState(0);
  const autoStartedRideRef = useRef(null);
  const heartbeatLostAtRef = useRef(null);

  const lastRouteKeyRef = useRef('');

  const pollDriverState = useCallback(async () => {
    if (!token || heartbeatPaused) return;
    try {
      const [meRes, offerRes, activeRes] = await Promise.all([
        apiRequest('/drivers/me', { token }),
        apiRequest('/drivers/me/offer', { token }),
        apiRequest('/drivers/me/active-ride', { token }),
      ]);
      setDriver(meRes.driver);
      setOffer(offerRes.offer || null);
      setActiveRide(activeRes.ride || null);
    } catch {
      // Ignore transient polling failures
    }
  }, [token, setDriver, heartbeatPaused]);

  useEffect(() => {
    void pollDriverState();
    const timer = setInterval(() => void pollDriverState(), 1500);
    return () => clearInterval(timer);
  }, [pollDriverState]);

  useEffect(() => {
    if (!heartbeatPaused) {
      setOfflineSeconds(0);
      heartbeatLostAtRef.current = null;
      return undefined;
    }
    heartbeatLostAtRef.current = Date.now();
    const timer = setInterval(() => {
      setOfflineSeconds(Math.floor((Date.now() - heartbeatLostAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [heartbeatPaused]);

  useEffect(() => {
    if (!token || !activeRide) {
      lastRouteKeyRef.current = '';
      setRoute(null);
      return;
    }
    const key = `${activeRide.id}:${activeRide.status}`;
    if (lastRouteKeyRef.current === key) return;
    lastRouteKeyRef.current = key;

    apiRequest(`/rides/${activeRide.id}/route`, { token })
      .then((data) => setRoute(data))
      .catch(() => {});
  }, [token, activeRide]);

  const toggleAvailability = async () => {
    if (!driver) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const nextAvailable = driver.status !== 'AVAILABLE';
      const data = await apiRequest('/drivers/me/availability', {
        method: 'POST',
        token,
        body: { available: nextAvailable },
      });
      setDriver(data.driver);
      setInfo(`Status updated to ${data.driver.status}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMapClick = async (latlng) => {
    setError('');
    setInfo('');
    try {
      const data = await apiRequest('/drivers/me/location', {
        method: 'POST',
        token,
        body: { lat: latlng.lat, lng: latlng.lng },
      });
      setDriver(data.driver);
      setInfo(`Location updated (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOfferRespond = async (offerId, action) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiRequest(`/offers/${offerId}/respond`, {
        method: 'POST',
        token,
        body: { action },
      });
      await pollDriverState();
      setInfo(action === 'accept' ? 'Ride accepted!' : 'Offer rejected.');
    } catch (err) {
      setError(err.message);
      await pollDriverState();
    } finally {
      setBusy(false);
    }
  };

  const handleAdvance = async () => {
    if (!activeRide) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const updated = await apiRequest(`/rides/${activeRide.id}/advance`, {
        method: 'POST',
        token,
      });
      setInfo(`Ride #${updated.id} moved to ${updated.status}`);
      await pollDriverState();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDriverCancel = async () => {
    if (!activeRide) return;
    setCancelling(true);
    setError('');
    try {
      await apiRequest(`/rides/${activeRide.id}/driver-cancel`, { method: 'POST', token });
      setInfo('Ride cancelled by driver. A replacement driver is being requested.');
      await pollDriverState();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  const runFullRideSimulation = async () => {
    if (!activeRide || !['ACCEPTED', 'ARRIVING', 'ONGOING'].includes(activeRide.status)) return;
    setSimulationRunning(true);
    setError('');
    try {
      let status = activeRide.status;
      if (status === 'ACCEPTED') {
        setSimulationStep('Driver is travelling to pickup...');
        await apiRequest(`/rides/${activeRide.id}/advance`, { method: 'POST', token });
        await pollDriverState();
        status = 'ARRIVING';
      }
      if (status === 'ARRIVING') {
        setSimulationStep('Passenger pickup simulation in progress...');
        await wait(12000);
        await apiRequest(`/rides/${activeRide.id}/advance`, { method: 'POST', token });
        await pollDriverState();
        status = 'ONGOING';
      }
      if (status === 'ONGOING') {
        setSimulationStep('Trip to destination simulation in progress...');
        await wait(18000);
        await apiRequest(`/rides/${activeRide.id}/advance`, { method: 'POST', token });
        await pollDriverState();
      }
      setSimulationStep('Simulation completed. Passenger can now pay.');
    } catch (err) {
      setError(err.message);
      setSimulationStep('Simulation stopped because the ride state changed.');
    } finally {
      setSimulationRunning(false);
    }
  };

  useEffect(() => {
    if (!automaticDemo || !activeRide || activeRide.status !== 'ACCEPTED' || simulationRunning) return;
    if (autoStartedRideRef.current === activeRide.id) return;
    autoStartedRideRef.current = activeRide.id;
    void runFullRideSimulation();
  }, [automaticDemo, activeRide?.id, activeRide?.status, simulationRunning]);

  const toggleConnectionSimulation = () => {
    if (heartbeatPaused) {
      setHeartbeatPaused(false);
      setInfo('Driver connection restored. Heartbeat updates resumed.');
      void pollDriverState();
      return;
    }
    setHeartbeatPaused(true);
    setInfo('Simulated internet loss. If this lasts beyond the timeout, the passenger will be reassigned.');
  };

  const isBusyOnRide = driver?.status === 'BUSY';
  const isAvailable = driver?.status === 'AVAILABLE';

  const mapCenter =
    driver?.lat != null && driver?.lng != null
      ? [driver.lat, driver.lng]
      : [15.8497, 74.4977];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Driver Console</h1>
          <p className="page-subtitle">
            Toggle availability, click the map to move your vehicle, and respond to ride offers.
          </p>
        </div>

        <button
          type="button"
          className={`btn ${isAvailable ? 'btn-danger' : 'btn-success'}`}
          disabled={busy || isBusyOnRide || !driver}
          onClick={() => void toggleAvailability()}
        >
          {isBusyOnRide
            ? 'Busy on Active Ride'
            : isAvailable
            ? 'Go Offline'
            : 'Go Online (Available)'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}
      {info && (
        <div className="alert alert-success" style={{ marginBottom: '16px' }}>
          {info}
        </div>
      )}

      <div className="split-grid">
        <div className="panel-stack">
          <div className="panel">
            <h2 className="panel-title">Driver Status</h2>
            {!driver ? (
              <p style={{ margin: 0, color: 'var(--ink-muted)' }}>Loading driver profile...</p>
            ) : (
              <>
                <div className="kv-grid">
                  <div className="kv-item">
                    <div className="kv-label">Status</div>
                    <div className="kv-value">{driver.status}</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-label">Vehicle</div>
                    <div className="kv-value">{driver.vehicleType}</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-label">Completed Rides</div>
                    <div className="kv-value tabular">{driver.ridesCompleted}</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-label">Offers Received</div>
                    <div className="kv-value tabular">{driver.offersReceived}</div>
                  </div>
                </div>
                <div className="meta-row" style={{ marginTop: '12px' }}>
                  <span>Plate: {driver.vehicleNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular">
                    Location:{' '}
                    {driver.lat != null
                      ? `${driver.lat.toFixed(4)}, ${driver.lng.toFixed(4)}`
                      : 'Unset'}
                  </span>
                </div>
                <div className="driver-demo-controls">
                  <button type="button" className={`btn btn-sm ${automaticDemo ? 'btn-success' : ''}`} onClick={() => setAutomaticDemo((value) => !value)}>
                    {automaticDemo ? 'Automatic Demo: ON' : 'Enable Automatic Demo'}
                  </button>
                  {heartbeatPaused && <span className="connection-loss-badge">Connection lost · {offlineSeconds}s</span>}
                </div>
              </>
            )}
          </div>

          {!activeRide ? (
            <OfferCard
              offer={offer}
              onRespond={(id, action) => void handleOfferRespond(id, action)}
              busy={busy}
            />
          ) : (
            <div className="panel">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <h2 className="panel-title" style={{ margin: 0 }}>
                  Active Ride #{activeRide.id}
                </h2>
                <span className="tabular" style={{ fontWeight: 700, fontSize: '18px' }}>
                  ₹{activeRide.estimatedFare}
                </span>
              </div>

              <RideStatusStepper status={activeRide.status} />

              <div style={{ fontSize: '14px', margin: '12px 0 16px' }}>
                <div>
                  <strong>Pickup:</strong>{' '}
                  {activeRide.pickup.label ||
                    `${activeRide.pickup.lat.toFixed(4)}, ${activeRide.pickup.lng.toFixed(4)}`}
                </div>
                <div>
                  <strong>Destination:</strong>{' '}
                  {activeRide.drop.label ||
                    `${activeRide.drop.lat.toFixed(4)}, ${activeRide.drop.lng.toFixed(4)}`}
                </div>
                <div>
                  <strong>Trip Distance:</strong>{' '}
                  <span className="tabular">{activeRide.tripDistanceKm} km</span>
                </div>
              </div>

              {NEXT_STEP_LABEL[activeRide.status] && (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled={busy}
                  onClick={() => void handleAdvance()}
                >
                  {busy ? 'Updating...' : NEXT_STEP_LABEL[activeRide.status]}
                </button>
              )}
              {['ACCEPTED', 'ARRIVING', 'ONGOING'].includes(activeRide.status) && (
                <>
                  <button type="button" className="btn btn-success" style={{ marginTop: '10px' }} disabled={busy || simulationRunning} onClick={() => void runFullRideSimulation()}>
                    {simulationRunning ? 'Simulation Running...' : 'Run Full Ride Simulation'}
                  </button>
                  {simulationStep && <div className="simulation-status" role="status">{simulationStep}</div>}
                </>
              )}
              {['ACCEPTED', 'ARRIVING'].includes(activeRide.status) && (
                <button type="button" className="btn btn-danger" style={{ marginTop: '10px' }} disabled={busy || cancelling} onClick={() => void handleDriverCancel()}>
                  {cancelling ? 'Reassigning...' : 'Cancel & Reassign Ride'}
                </button>
              )}
              {activeRide && ['ACCEPTED', 'ARRIVING'].includes(activeRide.status) && (
                <button type="button" className="btn btn-warning" style={{ marginTop: '10px' }} disabled={simulationRunning} onClick={toggleConnectionSimulation}>
                  {heartbeatPaused ? 'Reconnect Driver' : 'Simulate Internet Loss'}
                </button>
              )}
            </div>
          )}
        </div>

        <MapView
          center={mapCenter}
          pickup={activeRide?.pickup ?? offer?.pickup ?? null}
          drop={activeRide?.drop ?? offer?.drop ?? null}
          selfDriver={driver}
          route={route}
          animatedDriver={activeRide?.status === 'ARRIVING' ? { driver, geometry: route?.driverToPickup, position: true, phase: 'pickup', durationMs: 12000 } : activeRide?.status === 'ONGOING' ? { driver, geometry: route?.pickupToDrop, position: true, phase: 'trip', durationMs: 18000 } : null}
          onMapClick={(latlng) => void handleMapClick(latlng)}
          instruction="Click anywhere on the map to update your driver location"
        />
      </div>
    </div>
  );
}
