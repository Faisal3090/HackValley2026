import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api.js';

export default function DriverCostSettings({ token, driver, onSaved }) {
  const [form, setForm] = useState(null);
  const [commission, setCommission] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    apiRequest('/drivers/me/cost-settings', { token }).then((data) => {
      if (!live) return;
      setForm({ fuel: data.fuelCostPerKm ?? '', maintenance: data.maintenanceCostPerKm ?? '', lat: data.base?.lat ?? '', lng: data.base?.lng ?? '' });
      setCommission(data.commissionPercent);
    }).catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [token]);
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    setError(''); setMessage('');
    if ((form.lat === '') !== (form.lng === '')) { setError('Enter both home/base coordinates, or leave both empty.'); return; }
    setBusy(true);
    try {
      await apiRequest('/drivers/me/cost-settings', { token, method: 'PUT', body: {
        fuelCostPerKm: Number(form.fuel), maintenanceCostPerKm: Number(form.maintenance),
        base: form.lat === '' ? null : { lat: Number(form.lat), lng: Number(form.lng) },
      } });
      setMessage('Saved. New estimates will use these settings; accepted rides keep their saved costs.');
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <details className="panel">
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Vehicle costs &amp; home/base</summary>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {!form ? <p>Loading cost settings…</p> : <form onSubmit={save}>
      <p>Platform commission: {commission}% (platform configured).</p>
      <div className="kv-grid">
        {[
          ['fuel', 'Fuel cost (₹/km)', 0, 1000, true],
          ['maintenance', 'Maintenance cost (₹/km)', 0, 1000, true],
          ['lat', 'Home/base latitude', -90, 90, false],
          ['lng', 'Home/base longitude', -180, 180, false],
        ].map(([key, label, min, max, required]) => <label key={key}>{label}
          <input style={{ width: '100%' }} type="number" step="any" min={min} max={max} required={required} value={form[key]} onChange={(e) => change(key, e.target.value)} />
        </label>)}
      </div>
      <p style={{ fontSize: 12 }}>Return distance uses the nearest configured demand zone, or home/base when no zone is available.</p>
      <button type="button" className="btn" disabled={busy || driver?.lat == null || driver?.lng == null} onClick={() => setForm((old) => ({ ...old, lat: driver.lat, lng: driver.lng }))}>Use current location as base</button>{' '}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save costs'}</button>
      {message && <p role="status">{message}</p>}
    </form>}
  </details>;
}
