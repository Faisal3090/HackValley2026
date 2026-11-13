import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function NotificationBell({
  notifications: externalNotifications = null,
  onMarkRead = null,
}) {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [internalNotifications, setInternalNotifications] = useState([]);

  const isControlled = Array.isArray(externalNotifications);
  const notifications = isControlled ? externalNotifications : internalNotifications;

  const fetchNotifications = useCallback(async () => {
    if (!token || isControlled) return;
    try {
      const data = await apiRequest('/notifications', { token });
      setInternalNotifications(data.notifications || []);
    } catch {
      // Ignore transient polling errors
    }
  }, [token, isControlled]);

  useEffect(() => {
    if (!token || !user || isControlled) return undefined;
    void fetchNotifications();
    const timer = setInterval(() => void fetchNotifications(), 1500);
    return () => clearInterval(timer);
  }, [token, user, isControlled, fetchNotifications]);

  const markRead = async (id) => {
    if (onMarkRead) {
      await onMarkRead(id);
      return;
    }
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'POST', token });
      setInternalNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch {
      // Ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="notif-wrapper">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        Notifications ({unreadCount})
      </button>

      {open && (
        <div className="notif-popover">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <strong style={{ fontSize: '15px' }}>Notifications</strong>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          {notifications.length === 0 ? (
            <p style={{ margin: '8px 0', fontSize: '14px', color: 'var(--ink-muted)' }}>
              No notifications yet.
            </p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="notif-item">
                <div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: n.read ? 400 : 700,
                      color: n.read ? 'var(--ink-muted)' : 'var(--ink-primary)',
                    }}
                  >
                    {n.message}
                  </div>
                  <div className="tabular" style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                    {new Date(n.created_at).toLocaleTimeString()}
                  </div>
                </div>
                {!n.read && n.user_id === user?.id && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void markRead(n.id)}
                  >
                    Read
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
