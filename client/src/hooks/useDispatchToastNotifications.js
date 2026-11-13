import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api.js';

export const DISPATCH_UPDATED_EVENT = 'kasucab:dispatch-updated';
export const DISPATCH_RESET_EVENT = 'kasucab:dispatch-reset';

export function emitDispatchUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DISPATCH_UPDATED_EVENT));
  }
}

export function emitDispatchReset() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DISPATCH_RESET_EVENT));
  }
}

function buildQueueNotification(ride, userId) {
  const pickupLabel = ride.pickup?.label || 'Pickup';
  const dropLabel = ride.drop?.label || 'Drop';
  const vehicleTag = ride.vehicleType ? ` · ${ride.vehicleType}` : '';
  const fareTag = ride.estimatedFare != null ? ` · ₹${ride.estimatedFare}` : '';
  return {
    id: -Number(ride.id),
    user_id: userId,
    ride_id: ride.id,
    message: `New ride request #${ride.id}: ${pickupLabel} → ${dropLabel}${vehicleTag}${fareTag}`,
    read: false,
    created_at: ride.createdAt || new Date().toISOString(),
  };
}

export function useDispatchToastNotifications({
  token,
  user,
  enabled = true,
  pollIntervalMs = 1500,
  autoDismissMs = 6500,
  maxVisible = 4,
} = {}) {
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);

  const initializedRef = useRef(false);
  const seenNotificationIdsRef = useRef(new Set());
  const seenQueueRideIdsRef = useRef(new Set());
  const notifiedRideIdsRef = useRef(new Set());
  const timersRef = useRef(new Map());
  const inFlightRef = useRef(false);

  const clearTimer = useCallback((id) => {
    const existing = timersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  const removeToastFromState = useCallback(
    (id) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    },
    [clearTimer]
  );

  const scheduleDismiss = useCallback(
    (id) => {
      if (!autoDismissMs || autoDismissMs <= 0) return;
      clearTimer(id);
      const timer = setTimeout(() => {
        removeToastFromState(id);
      }, autoDismissMs);
      timersRef.current.set(id, timer);
    },
    [autoDismissMs, clearTimer, removeToastFromState]
  );

  const enqueueToast = useCallback(
    (notification) => {
      if (!notification || notification.id == null) return;
      setToasts((prev) => {
        const filtered = prev.filter((item) => item.id !== notification.id);
        const next = [notification, ...filtered];
        const trimmed = next.slice(0, maxVisible);
        const keptIds = new Set(trimmed.map((item) => item.id));
        for (const item of next) {
          if (!keptIds.has(item.id)) {
            clearTimer(item.id);
          }
        }
        return trimmed;
      });
      scheduleDismiss(notification.id);
    },
    [clearTimer, maxVisible, scheduleDismiss]
  );

  const upgradeToastId = useCallback(
    (oldId, persistedNotification) => {
      setToasts((prev) => {
        const hasOld = prev.some((item) => item.id === oldId);
        if (!hasOld) return prev;
        clearTimer(oldId);
        scheduleDismiss(persistedNotification.id);
        return prev.map((item) => (item.id === oldId ? persistedNotification : item));
      });
    },
    [clearTimer, scheduleDismiss]
  );

  const markRead = useCallback(
    async (notificationId) => {
      if (!token || !notificationId || notificationId <= 0) return;
      try {
        await apiRequest(`/notifications/${notificationId}/read`, {
          method: 'POST',
          token,
        });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
      } catch {
        // Ignore transient network errors
      }
    },
    [token]
  );

  const dismissToast = useCallback(
    (notification) => {
      if (!notification) return;
      removeToastFromState(notification.id);
      if (notification.id > 0 && notification.user_id === user?.id && !notification.read) {
        void markRead(notification.id);
      }
    },
    [markRead, removeToastFromState, user?.id]
  );

  const clearAllToasts = useCallback(() => {
    clearAllTimers();
    setToasts([]);
  }, [clearAllTimers]);

  const pauseToastTimer = useCallback(
    (id) => {
      clearTimer(id);
    },
    [clearTimer]
  );

  const resumeToastTimer = useCallback(
    (id) => {
      scheduleDismiss(id);
    },
    [scheduleDismiss]
  );

  const resetTracking = useCallback(() => {
    initializedRef.current = false;
    seenNotificationIdsRef.current.clear();
    seenQueueRideIdsRef.current.clear();
    notifiedRideIdsRef.current.clear();
    clearAllTimers();
    setToasts([]);
  }, [clearAllTimers]);

  const poll = useCallback(async () => {
    if (!enabled || !token || !user || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [notifRes, liveRes] = await Promise.all([
        apiRequest('/notifications?scope=dispatch', { token }).catch(() => null),
        apiRequest('/drivers/live', { token }).catch(() => null),
      ]);

      const notifList = notifRes?.notifications || [];
      const activeRides = liveRes?.activeRides || [];

      if (
        initializedRef.current &&
        notifList.length === 0 &&
        activeRides.length === 0 &&
        (seenQueueRideIdsRef.current.size > 0 || seenNotificationIdsRef.current.size > 0)
      ) {
        seenNotificationIdsRef.current.clear();
        seenQueueRideIdsRef.current.clear();
        notifiedRideIdsRef.current.clear();
      }

      if (!initializedRef.current) {
        for (const n of notifList) {
          seenNotificationIdsRef.current.add(n.id);
        }
        for (const r of activeRides) {
          seenQueueRideIdsRef.current.add(r.id);
          notifiedRideIdsRef.current.add(r.id);
        }
        initializedRef.current = true;
        if (notifRes) {
          setNotifications(notifList);
        }
        return;
      }

      if (notifRes) {
        setNotifications(notifList);
      }

      const chronologicalNotifs = [...notifList].reverse();
      for (const n of chronologicalNotifs) {
        if (seenNotificationIdsRef.current.has(n.id)) continue;
        seenNotificationIdsRef.current.add(n.id);

        const isQueueDispatchAlert =
          typeof n.message === 'string' && n.message.startsWith('New ride request #');

        if (isQueueDispatchAlert && n.ride_id) {
          seenQueueRideIdsRef.current.add(n.ride_id);
          if (notifiedRideIdsRef.current.has(n.ride_id)) {
            upgradeToastId(-Number(n.ride_id), n);
          } else {
            notifiedRideIdsRef.current.add(n.ride_id);
            enqueueToast(n);
          }
        } else if (!n.read && n.user_id === user.id) {
          enqueueToast(n);
        }
      }

      const chronologicalRides = [...activeRides].reverse();
      for (const ride of chronologicalRides) {
        if (seenQueueRideIdsRef.current.has(ride.id)) continue;
        seenQueueRideIdsRef.current.add(ride.id);
        if (!notifiedRideIdsRef.current.has(ride.id)) {
          notifiedRideIdsRef.current.add(ride.id);
          enqueueToast(buildQueueNotification(ride, user.id));
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, enqueueToast, token, upgradeToastId, user]);

  useEffect(() => {
    resetTracking();
    setNotifications([]);
    if (!enabled || !token || !user) return undefined;

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, pollIntervalMs);

    const handleUpdated = () => {
      void poll();
    };
    const handleReset = () => {
      resetTracking();
      void poll();
    };

    window.addEventListener(DISPATCH_UPDATED_EVENT, handleUpdated);
    window.addEventListener(DISPATCH_RESET_EVENT, handleReset);

    return () => {
      clearInterval(timer);
      clearAllTimers();
      window.removeEventListener(DISPATCH_UPDATED_EVENT, handleUpdated);
      window.removeEventListener(DISPATCH_RESET_EVENT, handleReset);
    };
  }, [clearAllTimers, enabled, poll, pollIntervalMs, resetTracking, token, user]);

  return {
    toasts,
    notifications,
    unreadCount: notifications.filter((n) => !n.read && n.user_id === user?.id).length,
    dismissToast,
    clearAllToasts,
    pauseToastTimer,
    resumeToastTimer,
    markRead,
    triggerToast: enqueueToast,
    refresh: poll,
  };
}
