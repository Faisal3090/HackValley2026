import defaultConfig from '../config/index.js';
import defaultPool from '../db/pool.js';
import { withTransaction } from '../db/tx.js';
import { recoveryStrategies as defaultStrategies } from '../hooks/recoveryStrategies.js';
import { publishAfterCommit, recordEvent } from './events.js';
import { createOffer } from './offers.js';

const NON_RECOVERABLE_STATUSES = new Set([
  'ACCEPTED',
  'ARRIVING',
  'ONGOING',
  'COMPLETED',
  'UNFULFILLED',
  'CANCELLED',
]);

export async function markUnfulfilled(client, ride, reason, events) {
  const { rows } = await client.query(
    `UPDATE rides
     SET status = 'UNFULFILLED',
         version = version + 1
     WHERE id = $1 AND status IN ('REQUESTED', 'DRIVER_OFFERED')
     RETURNING *`,
    [ride.id]
  );

  if (rows.length === 0) return null;

  const updated = rows[0];
  events.push(
    await recordEvent(client, {
      eventType: 'RIDE_UNFULFILLED',
      rideId: ride.id,
      payload: {
        reason,
        attempts: updated.attempt_count,
      },
    })
  );
  events.push(
    await recordEvent(client, {
      eventType: 'RIDE_STATUS_CHANGED',
      rideId: ride.id,
      payload: {
        from: ride.status,
        to: 'UNFULFILLED',
      },
    })
  );
  return updated;
}

export async function recoverRide(
  rideId,
  reason,
  {
    client = null,
    events = null,
    config = defaultConfig,
    pool = defaultPool,
    strategies = defaultStrategies,
  } = {}
) {
  const runInTx = async (txClient, txEvents) => {
    const { rows } = await txClient.query(
      'SELECT * FROM rides WHERE id = $1 FOR UPDATE',
      [rideId]
    );
    if (rows.length === 0) return { skipped: true, reason: 'not_found' };

    const ride = rows[0];
    if (NON_RECOVERABLE_STATUSES.has(ride.status)) {
      return { skipped: true, status: ride.status };
    }

    const strategy = strategies[reason] ?? strategies.default;
    return strategy({
      client: txClient,
      ride,
      reason,
      events: txEvents,
      config,
      pool,
      recordEvent,
      markUnfulfilled,
      createOffer,
    });
  };

  if (client) {
    return runInTx(client, events || []);
  }

  const collectedEvents = [];
  const result = await withTransaction(
    (txClient) => runInTx(txClient, collectedEvents),
    pool
  );
  publishAfterCommit(collectedEvents);
  return result;
}
