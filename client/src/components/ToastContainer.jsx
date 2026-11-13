import React from 'react';
import { BellRing, X } from 'lucide-react';

export default function ToastContainer({
  toasts = [],
  onDismiss,
  onInspectRide,
  onPause,
  onResume,
  onClearAll,
}) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <aside
      className="toast-viewport"
      role="region"
      aria-label="Real-time dispatch notifications"
      aria-live="polite"
    >
      {toasts.length > 1 && onClearAll && (
        <div className="toast-viewport-bar">
          <span className="tabular">{toasts.length} alerts</span>
          <button
            type="button"
            className="toast-clear-btn"
            onClick={onClearAll}
          >
            Clear all
          </button>
        </div>
      )}

      {toasts.map((toast) => {
        const isQueueAlert =
          typeof toast.message === 'string' && toast.message.startsWith('New ride request #');

        return (
          <div
            key={toast.id}
            className="toast-card"
            role="status"
            onMouseEnter={() => onPause?.(toast.id)}
            onMouseLeave={() => onResume?.(toast.id)}
            onFocus={() => onPause?.(toast.id)}
            onBlur={() => onResume?.(toast.id)}
          >
            <div className="toast-icon" aria-hidden="true">
              <BellRing size={18} strokeWidth={2.2} />
            </div>

            <div className="toast-body">
              <div className="toast-header-line">
                <span className="toast-kicker">
                  {isQueueAlert ? 'Dispatch Queue' : 'Ride Update'}
                </span>
                <span className="toast-meta tabular">
                  {toast.ride_id ? `Ride #${toast.ride_id} · ` : ''}
                  {new Date(toast.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>

              <div className="toast-message">{toast.message}</div>

              {toast.ride_id && onInspectRide && (
                <div className="toast-actions">
                  <button
                    type="button"
                    className="btn btn-sm toast-inspect-btn"
                    onClick={() => onInspectRide(toast)}
                  >
                    Inspect Ride
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="toast-dismiss-btn"
              aria-label={`Dismiss notification${toast.ride_id ? ` for Ride #${toast.ride_id}` : ''}`}
              onClick={() => onDismiss?.(toast)}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        );
      })}
    </aside>
  );
}
