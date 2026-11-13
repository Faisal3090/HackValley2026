import config from './config/index.js';
import pool from './db/pool.js';
import { expireStaleOffers } from './services/offers.js';
import { registerSubscribers } from './services/subscribers.js';

registerSubscribers(pool);

let stopping = false;
let timer = null;

async function tick() {
  if (stopping) return;
  try {
    const { expiredCount } = await expireStaleOffers({ pool, config });
    if (expiredCount > 0) {
      console.log(`[worker] Expired ${expiredCount} stale offer(s)`);
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
