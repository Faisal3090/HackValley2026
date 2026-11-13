import { EventEmitter } from 'node:events';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export function toEventEnvelope(row) {
  const envelope = {
    eventId: row.event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
    rideId: row.ride_id,
    payload: row.payload ?? {},
  };
  if (row.driver_id !== null && row.driver_id !== undefined) {
    envelope.driverId = row.driver_id;
  }
  if (row.offer_id !== null && row.offer_id !== undefined) {
    envelope.offerId = row.offer_id;
  }
  return envelope;
}

export async function recordEvent(
  client,
  { eventType, rideId, driverId = null, offerId = null, payload = {} }
) {
  const { rows } = await client.query(
    `INSERT INTO ride_events (event_type, ride_id, driver_id, offer_id, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [eventType, rideId, driverId, offerId, JSON.stringify(payload)]
  );
  return toEventEnvelope(rows[0]);
}

export function publishAfterCommit(events) {
  if (!Array.isArray(events)) {
    events = events ? [events] : [];
  }
  for (const event of events) {
    try {
      eventBus.emit('event', event);
      eventBus.emit(event.eventType, event);
    } catch (err) {
      console.error(`Event listener failed for ${event.eventType}:`, err);
    }
  }
}
