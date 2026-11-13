import config from './config/index.js';
import pool from './db/pool.js';
import { createApp } from './app.js';

const app = createApp({ pool, config });

const server = app.listen(config.PORT, () => {
  console.log(`RideMatch API listening on http://localhost:${config.PORT}/api/v1`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, closing server...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
