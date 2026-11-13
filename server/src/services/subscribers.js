import defaultPool from '../db/pool.js';
import { eventBus } from './events.js';
import { createNotification } from './notifications.js';

const SEEN_EVENT_IDS = new Set();
const MAX_SEEN = 2000;
const inFlight = new Set();
let registeredPool = null;

function rememberEventId(eventId) {
  if (!eventId) return true;
  if (SEEN_EVENT_IDS.has(eventId)) return false;
  if (SEEN_EVENT_IDS.size >= MAX_SEEN) {
    const first = SEEN_EVENT_IDS.values().next().value;
    if (first !== undefined) SEEN_EVENT_IDS.delete(first);
  }
  SEEN_EVENT_IDS.add(eventId);
  return true;
}

async function handleRideEvent(event, pool) {
  if (!rememberEventId(event.eventId)) return;

  try {
    if (event.eventType === 'RIDE_REQUESTED' && event.rideId) {
      const pickupLabel = event.payload?.pickup?.label || 'Pickup';
      const dropLabel = event.payload?.drop?.label || 'Drop';
      const vehicleTag = event.payload?.vehicleType ? ` · ${event.payload.vehicleType}` : '';
      const fareTag =
        event.payload?.estimatedFare != null ? ` · ₹${event.payload.estimatedFare}` : '';
      const dispatchMessage = `New ride request #${event.rideId}: ${pickupLabel} → ${dropLabel}${vehicleTag}${fareTag}`;

      const { rows: adminUsers } = await pool.query(
        "SELECT id FROM users WHERE role = 'admin'"
      );
      for (const admin of adminUsers) {
        await createNotification(
          { userId: admin.id, rideId: event.rideId, message: dispatchMessage },
          pool
        );
      }
      return;
    }

    if (event.eventType === 'DRIVER_OFFERED' && event.rideId && event.driverId) {
      const [{ rows: driverRows }, { rows: rideRows }] = await Promise.all([
        pool.query('SELECT user_id FROM drivers WHERE id = $1', [event.driverId]),
        pool.query('SELECT pickup_label, drop_label FROM rides WHERE id = $1', [event.rideId]),
      ]);
      if (driverRows.length > 0) {
        const pickupLabel = rideRows[0]?.pickup_label || 'Pickup';
        const dropLabel = rideRows[0]?.drop_label || 'Drop';
        const driverName = event.payload?.driverName || 'Driver';
        await createNotification(
          {
            userId: driverRows[0].user_id,
            rideId: event.rideId,
            message: `New ride request #${event.rideId} offered to ${driverName}: ${pickupLabel} → ${dropLabel}`,
          },
          pool
        );
      }
      return;
    }

    let message = null;
    if (event.eventType === 'DRIVER_ACCEPTED') {
      const driverName = event.payload?.driverName || 'A driver';
      message = `Driver ${driverName} accepted your ride`;
    } else if (event.eventType === 'RIDE_UNFULFILLED') {
      message = 'No driver available, please try again';
    } else if (event.eventType === 'RIDE_CANCELLED') {
      message = 'Your ride was cancelled';
    } else if (event.eventType === 'RIDE_STATUS_CHANGED') {
      const to = event.payload?.to;
      if (to === 'ARRIVING') message = 'Your driver is on the way to pickup';
      else if (to === 'ONGOING') message = 'Your trip has started';
      else if (to === 'COMPLETED') message = 'Your trip is completed';
    }

    if (!message || !event.rideId) return;

    const { rows } = await pool.query(
      'SELECT passenger_id FROM rides WHERE id = $1',
      [event.rideId]
    );
    if (rows.length === 0) return;

    await createNotification(
      { userId: rows[0].passenger_id, rideId: event.rideId, message },
      pool
    );
  } catch (err) {
    console.error('Notification subscriber error:', err);
  }
}

export function registerSubscribers(pool = defaultPool) {
  if (registeredPool === pool) return;
  registeredPool = pool;
  eventBus.removeAllListeners('event');
  eventBus.on('event', (event) => {
    const p = handleRideEvent(event, pool).finally(() => {
      inFlight.delete(p);
    });
    inFlight.add(p);
  });
}

export async function flushSubscribers() {
  if (inFlight.size === 0) return;
  await Promise.all([...inFlight]);
}
