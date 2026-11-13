import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../auth.jsx';
import MapView from '../components/MapView.jsx';
import AnimatedMetric from '../components/AnimatedMetric.jsx';
import PlaceSearch from '../components/PlaceSearch.jsx';
import RideStatusStepper from '../components/RideStatusStepper.jsx';
import { emitDispatchUpdated } from '../hooks/useDispatchToastNotifications.js';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'UNFULFILLED', 'CANCELLED']);

export default function PassengerHome() {
  const { token } = useAuth();

  const [cityCenter, setCityCenter] = useState([15.8497, 74.4977]);
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [vehicleType, setVehicleType] = useState('');
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [estimate, setEstimate] = useState(null);
  const [fareOptions, setFareOptions] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [route, setRoute] = useState(null);
  const [paymentState, setPaymentState] = useState('idle');

  const [locationStatus, setLocationStatus] = useState('');
  const [focusPoint, setFocusPoint] = useState(null);
  const [searchResetVersion, setSearchResetVersion] = useState(0);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const lastRouteKeyRef = useRef('');
  const activeRideRef = useRef(false);
  const pickupChosenRef = useRef(false);

  useEffect(() => {
    apiRequest('/dev/config')
      .then((cfg) => {
        if (cfg?.cityCenter) {
          setCityCenter([cfg.cityCenter.lat, cfg.cityCenter.lng]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('Location is unavailable in this browser. Search for or select a pickup on the map.');
      return undefined;
    }

    let cancelled = false;
    setLocationStatus('Finding your current location...');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled || activeRideRef.current || pickupChosenRef.current) return;
        const point = {
          lat: Number(coords.latitude.toFixed(6)),
          lng: Number(coords.longitude.toFixed(6)),
          label: 'Your current location',
        };
        pickupChosenRef.current = true;
        setPickup(point);
        setCityCenter([point.lat, point.lng]);
        setFocusPoint(point);
        setLocationStatus('Your current location is set as pickup.');
      },
      (geoError) => {
        if (cancelled) return;
        const message =
          geoError.code === geoError.PERMISSION_DENIED
            ? 'Location permission was denied. Search for or select a pickup on the map.'
            : geoError.code === geoError.TIMEOUT
            ? 'Finding your location timed out. Search for or select a pickup on the map.'
            : 'Could not determine your location. Search for or select a pickup on the map.';
        setLocationStatus(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    apiRequest('/rides/active', { token })
      .then((data) => {
        if (data?.ride) {
          activeRideRef.current = true;
          pickupChosenRef.current = true;
          setActiveRide(data.ride);
          setPickup(data.ride.pickup);
          setDrop(data.ride.drop);
        }
      })
      .catch(() => {});
  }, [token]);

  const fetchNearby = useCallback(
    async (point, vType) => {
      if (!token || !point) return;
      try {
        const params = new URLSearchParams({
          lat: String(point.lat),
          lng: String(point.lng),
        });
        if (vType) params.set('vehicleType', vType);
        const data = await apiRequest(`/drivers/nearby?${params.toString()}`, { token });
        setNearbyDrivers(data.drivers || []);
      } catch (err) {
        setError(err.message);
      }
    },
    [token]
  );

  useEffect(() => {
    if (pickup && !activeRide) {
      void fetchNearby(pickup, vehicleType);
    }
  }, [pickup, vehicleType, activeRide, fetchNearby]);

  useEffect(() => {
    if (!token || !pickup || !drop || activeRide) {
      if (!activeRide) setEstimate(null);
      return;
    }

    let cancelled = false;
    setLoadingEstimate(true);
    setError('');

    apiRequest('/rides/estimate', {
      method: 'POST',
      token,
      body: {
        pickup: { lat: pickup.lat, lng: pickup.lng },
        drop: { lat: drop.lat, lng: drop.lng },
        ...(vehicleType ? { vehicleType } : {}),
      },
    })
      .then((data) => {
        if (!cancelled) setEstimate(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingEstimate(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, pickup, drop, vehicleType, activeRide]);

  useEffect(() => {
    if (!token || !pickup || !drop || activeRide) {
      setFareOptions([]);
      return undefined;
    }
    let cancelled = false;
    const types = ['AUTO', 'HATCHBACK', 'SEDAN', 'SUV'];
    Promise.all(
      types.map((type) => apiRequest('/rides/estimate', {
        method: 'POST',
        token,
        body: { pickup: { lat: pickup.lat, lng: pickup.lng }, drop: { lat: drop.lat, lng: drop.lng }, vehicleType: type },
      }).then((data) => ({ type, fare: data.estimatedFare, eta: data.tripDurationMin })))
    ).then((options) => {
      if (!cancelled) setFareOptions(options);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [token, pickup, drop, activeRide]);

  // Poll active ride every 1.5 seconds
  useEffect(() => {
    if (!token || !activeRide || TERMINAL_STATUSES.has(activeRide.status)) return;

    const timer = setInterval(async () => {
      try {
        const updated = await apiRequest(`/rides/${activeRide.id}`, { token });
        setActiveRide(updated);
      } catch {
        // Ignore transient poll errors
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [token, activeRide]);

  // Fetch route once per ride status or driver assignment/offer change
  useEffect(() => {
    if (!token || !activeRide) {
      lastRouteKeyRef.current = '';
      setRoute(null);
      return;
    }

    const key = `${activeRide.id}:${activeRide.status}:${activeRide.currentOffer?.driverId ?? ''}:${activeRide.currentDriver?.id ?? ''}`;
    if (lastRouteKeyRef.current === key) return;
    lastRouteKeyRef.current = key;

    apiRequest(`/rides/${activeRide.id}/route`, { token })
      .then((data) => setRoute(data))
      .catch(() => {});
  }, [token, activeRide]);

  const handleMapClick = (latlng) => {
    if (activeRide && !TERMINAL_STATUSES.has(activeRide.status)) return;
    if (activeRide && TERMINAL_STATUSES.has(activeRide.status)) {
      setActiveRide(null);
      activeRideRef.current = false;
      setRoute(null);
      pickupChosenRef.current = true;
      setPickup({ ...latlng, label: 'Selected Pickup' });
      setDrop(null);
      setLocationStatus('Pickup selected on the map.');
      return;
    }
    if (!pickup) {
      pickupChosenRef.current = true;
      setPickup({ ...latlng, label: 'Selected Pickup' });
      setLocationStatus('Pickup selected on the map.');
    } else if (!drop) {
      setDrop({ ...latlng, label: 'Selected Destination' });
    } else {
      setDrop({ ...latlng, label: 'Selected Destination' });
    }
  };

  const resetPoints = () => {
    setPickup(null);
    setDrop(null);
    setEstimate(null);
    setFareOptions([]);
    setNearbyDrivers([]);
    setRoute(null);
    setError('');
    activeRideRef.current = false;
    pickupChosenRef.current = true;
    setFocusPoint(null);
    setLocationStatus('Select a new pickup on the map or search for one.');
    setSearchResetVersion((version) => version + 1);
  };

  const handleRequestRide = async () => {
    if (!pickup || !drop) return;
    setSubmitting(true);
    setError('');
    try {
      const idemKey = `ride-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ride = await apiRequest('/rides', {
        method: 'POST',
        token,
        headers: { 'Idempotency-Key': idemKey },
        body: {
          pickup: { lat: pickup.lat, lng: pickup.lng },
          drop: { lat: drop.lat, lng: drop.lng },
          pickupLabel: pickup.label || '',
          dropLabel: drop.label || '',
          vehicleType: vehicleType || null,
        },
      });
      setActiveRide(ride);
      setPaymentState('idle');
      emitDispatchUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide) return;
    setSubmitting(true);
    setError('');
    try {
      const updated = await apiRequest(`/rides/${activeRide.id}/cancel`, {
        method: 'POST',
        token,
      });
      setActiveRide(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isActiveNonTerminal = activeRide && !TERMINAL_STATUSES.has(activeRide.status);
  const canCancel =
    activeRide &&
    ['REQUESTED', 'DRIVER_OFFERED', 'ACCEPTED'].includes(activeRide.status);

  const instruction = isActiveNonTerminal
    ? `Tracking Ride #${activeRide.id} · ${activeRide.status}`
    : !pickup
    ? 'Click map to set Pickup point'
    : !drop
    ? 'Click map to set Destination point'
    : 'Pickup and Destination set · Review estimate and request ride';

  const mapDrivers = activeRide?.currentDriver
    ? [activeRide.currentDriver]
    : activeRide?.latestRanking?.length
    ? activeRide.latestRanking.map((r) => ({
        id: r.driverId,
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        vehicleType: r.vehicleType,
        distanceKm: r.distanceKm,
        etaMin: r.etaMin,
        status: 'AVAILABLE',
      }))
    : nearbyDrivers;

  const animationPhase = activeRide?.status === 'ONGOING'
    ? 'trip'
    : activeRide?.status === 'ARRIVING'
    ? 'pickup'
    : null;
  const animationGeometry = animationPhase === 'trip' ? route?.pickupToDrop : route?.driverToPickup;
  const animatedDriver = animationPhase && activeRide?.currentDriver
    ? {
        driver: activeRide.currentDriver,
        geometry: animationGeometry,
        position: true,
        phase: animationPhase,
        durationMs: animationPhase === 'trip' ? 18000 : 12000,
      }
    : null;

  const handlePayment = () => {
    setPaymentState('processing');
    window.setTimeout(() => setPaymentState('paid'), 1600);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Book a Ride</h1>
          <p className="page-subtitle">
            Your location is selected as pickup automatically. Search for a destination or choose it on the map.
          </p>
        </div>
        {!isActiveNonTerminal && (
          <button type="button" className="btn" onClick={resetPoints}>
            Reset Points
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div className="split-grid">
        <div className="panel-stack">
          {!activeRide ? (
            <>
              <div className="panel">
                <h2 className="panel-title">Trip Points & Vehicle</h2>

                <PlaceSearch
                  key={`pickup-${searchResetVersion}`}
                  label="From"
                  placeholder="Search for a pickup location"
                  location={pickup}
                  token={token}
                  bias={pickup || { lat: cityCenter[0], lng: cityCenter[1] }}
                  onEdit={() => {
                    pickupChosenRef.current = true;
                    setPickup(null);
                  }}
                  onSelect={(place) => {
                    pickupChosenRef.current = true;
                    setPickup(place);
                    setFocusPoint(place);
                    setLocationStatus('Pickup selected.');
                  }}
                />
                <PlaceSearch
                  key={`destination-${searchResetVersion}`}
                  label="Destination"
                  placeholder="Search for a destination"
                  location={drop}
                  token={token}
                  bias={pickup || { lat: cityCenter[0], lng: cityCenter[1] }}
                  onEdit={() => setDrop(null)}
                  onSelect={(place) => {
                    setDrop(place);
                    setFocusPoint(place);
                  }}
                />
                {locationStatus && (
                  <p className="place-search-message" role="status">
                    {locationStatus}
                  </p>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="paxVehicle">
                    Vehicle Preference
                  </label>
                  <select
                    id="paxVehicle"
                    className="select"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                  >
                    <option value="">Any Available Vehicle</option>
                    <option value="AUTO">AUTO (0.8x)</option>
                    <option value="HATCHBACK">HATCHBACK (1.0x)</option>
                    <option value="SEDAN">SEDAN (1.2x)</option>
                    <option value="SUV">SUV (1.5x)</option>
                  </select>
                </div>

                <div style={{ fontSize: '14px', color: 'var(--ink-secondary)' }}>
                  <div>
                    <strong>Pickup:</strong>{' '}
                    {pickup
                      ? `${pickup.label} (${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)})`
                      : 'Not set'}
                  </div>
                  <div>
                    <strong>Destination:</strong>{' '}
                    {drop
                      ? `${drop.label} (${drop.lat.toFixed(4)}, ${drop.lng.toFixed(4)})`
                      : 'Not set'}
                  </div>
                </div>
              </div>

              <div className="panel">
                <h2 className="panel-title">Fare Estimate</h2>
                {loadingEstimate ? (
                  <p style={{ margin: 0, color: 'var(--ink-muted)' }}>Calculating route and fare...</p>
                ) : !estimate ? (
                  <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
                    Set both pickup and destination to calculate fare and pickup ETA.
                  </p>
                ) : (
                  <>
                    <div className="kv-grid" style={{ marginBottom: '14px' }}>
                      <div className="kv-item">
                        <div className="kv-label">Estimated Fare</div>
                        <div className="kv-value tabular estimate-value"><AnimatedMetric value={estimate.estimatedFare} prefix="₹" decimals={0} /></div>
                      </div>
                      <div className="kv-item">
                        <div className="kv-label">Nearest Pickup ETA</div>
                        <div className="kv-value tabular">
                          {estimate.nearestEtaMin != null ? <AnimatedMetric value={estimate.nearestEtaMin} suffix=" min" /> : 'No drivers'}
                        </div>
                      </div>
                      <div className="kv-item">
                        <div className="kv-label">Distance</div>
                        <div className="kv-value tabular"><AnimatedMetric value={estimate.tripDistanceKm} suffix=" km" /></div>
                      </div>
                      <div className="kv-item">
                        <div className="kv-label">Trip Duration</div>
                        <div className="kv-value tabular"><AnimatedMetric value={estimate.tripDurationMin} suffix=" min" /></div>
                      </div>
                    </div>

                    {fareOptions.length > 0 && (
                      <div className="fare-option-grid" aria-label="Fare by vehicle type">
                        {fareOptions.map((option) => (
                          <button
                            type="button"
                            key={option.type}
                            className={`fare-option ${vehicleType === option.type || (!vehicleType && option.type === 'HATCHBACK') ? 'selected' : ''}`}
                            onClick={() => setVehicleType(option.type)}
                          >
                            <span>{option.type}</span>
                            <strong>₹{option.fare}</strong>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="meta-row fare-refresh-row" style={{ marginBottom: '14px' }}>
                      <span>Base ₹{estimate.fareBreakdown?.baseFare}</span>
                      <span aria-hidden="true">·</span>
                      <span>+ ₹{estimate.fareBreakdown?.perKmRate}/km</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {estimate.fareBreakdown?.vehicleType} ({estimate.fareBreakdown?.vehicleMultiplier}x)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Route: {estimate.routeSource}</span>
                      <span className="estimate-live-badge">Live estimate</span>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      disabled={submitting || !pickup || !drop}
                      onClick={() => void handleRequestRide()}
                    >
                      {submitting ? 'Requesting Ride...' : `Request Ride · ₹${estimate.estimatedFare}`}
                    </button>
                  </>
                )}
              </div>

              <div className="panel">
                <h2 className="panel-title">Nearby Available Drivers ({nearbyDrivers.length})</h2>
                {!pickup ? (
                  <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
                    Set a pickup point to see available drivers nearby.
                  </p>
                ) : nearbyDrivers.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
                    No available drivers found within search radius.
                  </p>
                ) : (
                  <div className="driver-list">
                    {nearbyDrivers.slice(0, 6).map((d) => (
                      <div key={d.id} className="driver-row">
                        <div>
                          <strong>{d.name}</strong>
                          <div style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                            {d.vehicleType}
                          </div>
                        </div>
                        <div className="tabular" style={{ textAlign: 'right', fontSize: '14px' }}>
                          <div>
                            <strong>{d.distanceKm} km</strong>
                          </div>
                          <div style={{ color: 'var(--ink-muted)' }}>ETA {d.etaMin} min</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
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
                  Ride #{activeRide.id}
                </h2>
                <span className="tabular" style={{ fontWeight: 700, fontSize: '18px' }}>
                  ₹{activeRide.finalFare ?? activeRide.estimatedFare}
                </span>
              </div>

              <RideStatusStepper status={activeRide.status} />

              {activeRide.status === 'COMPLETED' && paymentState !== 'paid' && (
                <div className="payment-demo-card">
                  <div className="payment-demo-icon">₹</div>
                  <div>
                    <strong>{paymentState === 'processing' ? 'Processing payment...' : 'Payment due'}</strong>
                    <div className="meta-row">Demo checkout for Ride #{activeRide.id}</div>
                  </div>
                  {paymentState === 'idle' && <button type="button" className="btn btn-primary" onClick={handlePayment}>Pay ₹{activeRide.finalFare ?? activeRide.estimatedFare}</button>}
                  {paymentState === 'processing' && <span className="payment-spinner" aria-label="Processing" />}
                </div>
              )}

              {activeRide.status === 'COMPLETED' && paymentState === 'paid' && (
                <div className="payment-demo-card payment-demo-success"><div className="payment-check">✓</div><div><strong>Payment completed</strong><div className="meta-row">Thank you for riding with KasuCab.</div></div></div>
              )}

              {activeRide.status === 'DRIVER_OFFERED' && activeRide.currentOffer && (
                <div className="alert alert-info" style={{ marginTop: '12px' }}>
                  Offering ride to <strong>{activeRide.currentOffer.driverName}</strong> (attempt{' '}
                  {activeRide.attemptCount}/{activeRide.maxAttempts}) ·{' '}
                  <span className="tabular">{activeRide.currentOffer.secondsLeft}s</span> left
                </div>
              )}

              {activeRide.currentDriver && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '12px',
                    background: 'var(--bg-subtle)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    Assigned Driver: {activeRide.currentDriver.name}
                  </div>
                  <div className="meta-row">
                    <span>{activeRide.currentDriver.vehicleType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeRide.currentDriver.vehicleNumber}</span>
                    {activeRide.currentDriver.phone && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular">{activeRide.currentDriver.phone}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="kv-grid" style={{ marginTop: '14px' }}>
                <div className="kv-item">
                  <div className="kv-label">Pickup ETA</div>
                  <div className="kv-value tabular">
                    {activeRide.estimatedPickupEtaMin != null
                      ? `${activeRide.estimatedPickupEtaMin} min`
                      : '—'}
                  </div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">Distance</div>
                  <div className="kv-value tabular">{activeRide.tripDistanceKm} km</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                {canCancel && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    disabled={submitting}
                    onClick={() => void handleCancelRide()}
                  >
                    Cancel Ride
                  </button>
                )}

                {TERMINAL_STATUSES.has(activeRide.status) && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setActiveRide(null);
                      setRoute(null);
                    }}
                  >
                    {activeRide.status === 'UNFULFILLED'
                      ? 'No driver found, try again'
                      : 'Book Another Ride'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <MapView
          center={cityCenter}
          focusPoint={focusPoint}
          pickup={pickup}
          drop={drop}
          drivers={mapDrivers}
          offeredDriverId={activeRide?.currentOffer?.driverId ?? null}
          assignedDriverId={activeRide?.currentDriver?.id ?? null}
          route={route}
          animatedDriver={animatedDriver}
          onMapClick={handleMapClick}
          instruction={instruction}
        />
      </div>
    </div>
  );
}
