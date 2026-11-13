import React, { useCallback, useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { apiRequest } from '../api.js';
import { useAuth } from '../auth.jsx';

const center = [15.8497, 74.4977];
const point = (lat, lng) => ({ lat: Number(lat), lng: Number(lng) });

function color(level) { return level === 'HIGH' ? '#ef4444' : level === 'MEDIUM' ? '#f59e0b' : '#22c55e'; }

export default function TrafficIntelligence() {
  const { token, user } = useAuth();
  const [horizon, setHorizon] = useState(15);
  const [predictions, setPredictions] = useState([]);
  const [routes, setRoutes] = useState(null);
  const [emergency, setEmergency] = useState(null);
  const [signal, setSignal] = useState(null);
  const [incident, setIncident] = useState(null);
  const [marketplace, setMarketplace] = useState(null);
  const [message, setMessage] = useState('');
  const [origin, setOrigin] = useState(point(15.842, 74.489));
  const [destination, setDestination] = useState(point(15.861, 74.512));

  const load = useCallback(async () => {
    try { setPredictions((await apiRequest(`/traffic/overview?horizon=${horizon}`, { token })).predictions || []); } catch (error) { setMessage(error.message); }
  }, [horizon, token]);
  useEffect(() => { void load(); }, [load]);

  async function batchAllocate() {
    const data = await apiRequest('/drivers/live', { token });
    const ids = (data.activeRides || []).filter((ride) => ride.status === 'REQUESTED').slice(0, 10).map((ride) => ride.id);
    if (!ids.length) { setMarketplace({ message: 'Create two or more ride requests first; no REQUESTED rides are waiting.' }); return; }
    setMarketplace(await apiRequest('/dispatch/batch-allocate', { method: 'POST', token, body: { rideIds: ids } }));
  }

  async function reassign() { setMarketplace(await apiRequest('/dispatch/reassign-slow-rides', { method: 'POST', token, body: {} })); }

  const routePayload = { origin: { lat: Number(origin.lat), lng: Number(origin.lng) }, destination: { lat: Number(destination.lat), lng: Number(destination.lng) } };
  async function compare() { setRoutes(await apiRequest('/traffic/route-options', { method: 'POST', token, body: routePayload })); }
  async function emergencyRoute() { setEmergency(await apiRequest('/traffic/emergency-route', { method: 'POST', token, body: routePayload })); }
  async function optimize() { setSignal(await apiRequest('/traffic/signals/optimize', { method: 'POST', token, body: { approaches: { north: { vehicleCount: 34 }, south: { vehicleCount: 20 }, east: { vehicleCount: 52 }, west: { vehicleCount: 14 } }, phases: [{ approaches: ['north', 'south'] }, { approaches: ['east', 'west'] }] } })); }
  async function reportIncident() { setIncident((await apiRequest('/traffic/incidents', { method: 'POST', token, body: { type: 'ACCIDENT', latitude: 15.853, longitude: 74.501, severity: 'HIGH', lanesBlocked: 1, description: 'Demo collision report' } })).incident); }
  async function simulate() { setIncident(await apiRequest('/traffic/incidents/simulate', { method: 'POST', token, body: { incident: { roadSegmentId: 3, severity: 'HIGH', lanesBlocked: 1 }, origin, destination } })); }

  return <div className="page-container">
    <div className="page-header"><div><h1 className="page-title">Traffic Intelligence</h1><p className="page-subtitle">Predictive congestion, incident impact, signal simulation and emergency routing.</p></div><div className="segmented"><button className={horizon === 15 ? 'active' : ''} onClick={() => setHorizon(15)}>15 min</button><button className={horizon === 30 ? 'active' : ''} onClick={() => setHorizon(30)}>30 min</button></div></div>
    {message && <div className="alert alert-error">{message}</div>}
    <div className="split-grid">
      <div className="panel-stack">
        <div className="panel"><h2 className="panel-title">Congestion forecast</h2><p className="panel-subtitle">Historical flow + time of day + capacity + weather + incidents.</p>{predictions.map((p) => <div className="driver-row" key={p.segmentId}><div><strong>{p.name}</strong><div className="meta-row">{p.suggestedAction}</div></div><span style={{ color: color(p.riskLevel), fontWeight: 800 }}>{p.riskLevel} · {Math.round(p.congestionScore * 100)}%</span></div>)}</div>
        <div className="panel"><h2 className="panel-title">Route optimization</h2><div className="form-grid"><label>Origin latitude<input className="input" value={origin.lat} onChange={(e) => setOrigin({ ...origin, lat: e.target.value })} /></label><label>Origin longitude<input className="input" value={origin.lng} onChange={(e) => setOrigin({ ...origin, lng: e.target.value })} /></label><label>Destination latitude<input className="input" value={destination.lat} onChange={(e) => setDestination({ ...destination, lat: e.target.value })} /></label><label>Destination longitude<input className="input" value={destination.lng} onChange={(e) => setDestination({ ...destination, lng: e.target.value })} /></label></div><div className="button-row"><button className="btn btn-primary" onClick={compare}>Compare routes</button><button className="btn" onClick={emergencyRoute}>Emergency route</button></div>{routes?.routes?.map((r) => <div className="driver-row" key={r.id}><div><strong>{r.id} {r.recommended && '★ Recommended'}</strong><div className="meta-row">{r.reasons.join(' · ')}</div></div><span className="tabular">{r.durationMin} min</span></div>)}{emergency && <div className="alert alert-success">Priority route saves <strong>{emergency.timeSavedMin} min</strong> ({emergency.junctionPriority.length} junctions simulated).</div>}</div>
        <div className="panel"><h2 className="panel-title">Incidents & signal control</h2><div className="button-row"><button className="btn" onClick={reportIncident}>Report / deduplicate incident</button><button className="btn" onClick={simulate}>Simulate closure impact</button><button className="btn" onClick={optimize}>Optimize junction</button></div>{incident?.diversion && <p className="panel-subtitle">{incident.diversion.recommendation} Delay: {incident.diversion.delayMin} min.</p>}{incident?.id && <p className="panel-subtitle">Incident #{incident.id} active. Reports merged: {incident.reportCount || 1}.</p>}{signal && <div className="alert alert-success">Average wait reduced from {signal.before.averageWaitSeconds}s to {signal.after.averageWaitSeconds}s ({signal.improvementPercent}% improvement).</div>}</div>
        <div className="panel"><h2 className="panel-title">Marketplace dispatch</h2><p className="panel-subtitle">Allocate up to 10 waiting rides together using ETA, idle time, completed rides and acceptance rate.</p>{user?.role === 'admin' ? <><div className="button-row"><button className="btn btn-primary" onClick={batchAllocate}>Batch match waiting rides</button><button className="btn" onClick={reassign}>Recheck delayed assignments</button></div>{marketplace?.message && <p className="panel-subtitle">{marketplace.message}</p>}{marketplace?.assignments?.length > 0 && <div className="alert alert-success">Matched {marketplace.assignments.length} ride(s) in one batch. {marketplace.assignments.map((a) => `Ride #${a.rideId} → Driver #${a.driverId} (${a.etaMin} min)`).join(' · ')}</div>}{marketplace?.reassigned?.length > 0 && <div className="alert alert-success">Reassigned {marketplace.reassigned.length} delayed ride(s): {marketplace.reassigned.map((a) => `Ride #${a.rideId} saved ${a.timeSavedMin} min`).join(' · ')}</div>}{marketplace && !marketplace.assignments?.length && !marketplace.reassigned?.length && !marketplace.message && <p className="panel-subtitle">No eligible batch or reassignment was found.</p>}</> : <p className="panel-subtitle">Sign in as <strong>admin</strong> to run marketplace allocation and reassignment simulations.</p>}</div>
      </div>
      <div className="panel" style={{ minHeight: 560 }}><MapContainer center={center} zoom={13} style={{ height: '100%', minHeight: 540, borderRadius: 16 }}><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{predictions.map((p) => { const coords = p.geometry?.coordinates || []; const positions = coords.map(([lng, lat]) => [lat, lng]); const density = Number(p.densityPercent ?? p.congestionScore * 100); const trafficColor = color(p.riskLevel); const midpoint = positions[Math.floor(positions.length / 2)] || center; return <React.Fragment key={p.segmentId}><Polyline positions={positions} pathOptions={{ color: '#253047', weight: 16, opacity: .42, lineCap: 'round', lineJoin: 'round' }} /><Polyline positions={positions} pathOptions={{ color: trafficColor, weight: 5 + density / 16, opacity: .92, lineCap: 'round', lineJoin: 'round' }} /><CircleMarker center={midpoint} radius={8 + density / 18} pathOptions={{ color: '#fff', weight: 2, fillColor: trafficColor, fillOpacity: .9 }}><Popup><strong>{p.name}</strong><br />Traffic density: <strong>{density}%</strong><br />Estimated flow: {Number(p.vehicleCount || 0).toLocaleString()} vehicles/hour<br />Road capacity: {Number(p.capacityVehiclesPerHour || 0).toLocaleString()} vehicles/hour<br />{p.riskLevel} risk · {p.suggestedAction}</Popup></CircleMarker></React.Fragment>; })}</MapContainer><div className="map-legend" style={{ bottom: 14, top: 'auto' }}><span className="legend-item"><span className="legend-swatch" style={{ background: '#22c55e' }} />Low density</span><span className="legend-item"><span className="legend-swatch" style={{ background: '#f59e0b' }} />Medium</span><span className="legend-item"><span className="legend-swatch" style={{ background: '#ef4444' }} />High density</span></div></div>
    </div>
  </div>;
}
