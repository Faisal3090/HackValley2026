import React from 'react';

function summarizePayload(ev) {
  const p = ev.payload || {};
  if (ev.eventType === 'DRIVER_RANKED') {
    const count = p.rankedDrivers?.length ?? 0;
    return `Ranker=${p.rankerUsed}, fellBack=${Boolean(p.fellBack)}, candidates=${count}`;
  }
  if (ev.eventType === 'DRIVER_OFFERED') {
    return `${p.driverName || `Driver #${ev.driverId}`} · attempt ${p.attempt} · score ${p.score}`;
  }
  if (ev.eventType === 'DRIVER_ACCEPTED' || ev.eventType === 'DRIVER_REJECTED') {
    return `${p.driverName || `Driver #${ev.driverId}`} (offer #${ev.offerId})`;
  }
  if (ev.eventType === 'RIDE_STATUS_CHANGED') {
    return `${p.from} -> ${p.to}`;
  }
  if (ev.eventType === 'RIDE_REASSIGNED') {
    return `Reason: ${p.reason} · next attempt #${p.attempt}`;
  }
  if (ev.eventType === 'LATE_RESPONSE_REJECTED') {
    return `Offer #${ev.offerId} rejected (${p.currentOfferStatus})`;
  }
  if (ev.eventType === 'RIDE_UNFULFILLED') {
    return `Reason: ${p.reason} (${p.attempts} attempts)`;
  }
  if (ev.eventType === 'RIDE_REQUESTED') {
    return `Est. fare ₹${p.estimatedFare} (${p.routeSource || 'route'})`;
  }
  return JSON.stringify(p);
}

export default function EventTimeline({ events }) {
  return (
    <div className="panel">
      <h3 className="panel-title">Event Timeline</h3>
      {!events || events.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
          No ride events recorded yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
          {events.map((ev) => (
            <div
              key={ev.eventId}
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                background: 'var(--bg-canvas)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <strong style={{ fontSize: '14px' }}>{ev.eventType}</strong>
                <span className="tabular" style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                  {new Date(ev.occurredAt).toLocaleTimeString()}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
                {summarizePayload(ev)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
