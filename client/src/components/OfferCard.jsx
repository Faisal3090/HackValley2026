import React from 'react';

export default function OfferCard({ offer, onRespond, busy }) {
  if (!offer) {
    return (
      <div className="panel">
        <h3 className="panel-title">Incoming Ride Offer</h3>
        <p style={{ margin: 0, color: 'var(--ink-muted)' }}>
          No pending offer right now. Keep your status Available to receive ride requests.
        </p>
      </div>
    );
  }

  return (
    <div className="panel" style={{ borderColor: '#d97706' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <h3 className="panel-title" style={{ margin: 0 }}>
          New Ride Offer #{offer.id}
        </h3>
        <span className="tabular" style={{ fontWeight: 700, fontSize: '18px', color: 'var(--warning)' }}>
          {Number(offer.secondsLeft ?? 0).toFixed(0)}s left
        </span>
      </div>

      <div className="kv-grid" style={{ marginBottom: '14px' }}>
        <div className="kv-item">
          <div className="kv-label">Estimated Fare</div>
          <div className="kv-value tabular">₹{offer.estimatedFare ?? '—'}</div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Trip Distance</div>
          <div className="kv-value tabular">{offer.tripDistanceKm ?? '—'} km</div>
        </div>
      </div>

      <div style={{ fontSize: '14px', marginBottom: '14px' }}>
        <div>
          <strong>Passenger:</strong> {offer.passengerName || 'Passenger'}
        </div>
        <div>
          <strong>Pickup:</strong>{' '}
          {offer.pickup?.label || `${offer.pickup?.lat?.toFixed(4)}, ${offer.pickup?.lng?.toFixed(4)}`}
        </div>
        <div>
          <strong>Destination:</strong>{' '}
          {offer.drop?.label || `${offer.drop?.lat?.toFixed(4)}, ${offer.drop?.lng?.toFixed(4)}`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          className="btn btn-success"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={() => onRespond(offer.id, 'accept')}
        >
          Accept Ride
        </button>
        <button
          type="button"
          className="btn btn-danger"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={() => onRespond(offer.id, 'reject')}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
