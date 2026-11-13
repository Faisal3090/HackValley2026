import config from './config/index.js';
import pool from './db/pool.js';
import { expireStaleOffers } from './services/offers.js';
import { registerSubscribers } from './services/subscribers.js';
import { refreshTrafficPredictions } from './services/traffic.js';
import { reassignSlowRides } from './services/marketplace.js';

registerSubscribers(pool);

let stopping = false;
let timer = null;
let lastTrafficRefresh = 0;
let lastReassignmentCheck = 0;

async function tick() {
  if (stopping) return;
  try {
    const { expiredCount } = await expireStaleOffers({ pool, config });
    if (expiredCount > 0) {
      console.log(`[worker] Expired ${expiredCount} stale offer(s)`);
    }
    if (config.TRAFFIC_PREDICTION_ENABLED !== false && Date.now() - lastTrafficRefresh > 300000) {
      const count = await refreshTrafficPredictions({ pool, config });
      lastTrafficRefresh = Date.now();
      if (count) console.log(`[worker] Refreshed ${count} traffic prediction(s)`);
    }
    if (Date.now() - lastReassignmentCheck > 15000) {
      const reassignment = await reassignSlowRides({ pool, config });
      lastReassignmentCheck = Date.now();
      if (reassignment.reassigned.length) console.log(`[worker] Reassigned ${reassignment.reassigned.length} traffic-delayed ride(s)`);
    }
  } catch (err) {
    console.error('[worker] Error expiring stale offers:', err);
  } finally {
    if (!stopping) {
      timer = setTimeout(() => void tick(), 1000);
    }
  }
}

console.log(
  `RideMatch worker started (interval=1000ms, offerTimeout=${config.OFFER_TIMEOUT_SECONDS}s, maxAttempts=${config.MAX_ATTEMPTS})`
);
void tick();

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] Received ${signal}, shutting down...`);
  if (timer) clearTimeout(timer);
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
