import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './server/src/config/index.js';
import { runMigrations } from './server/src/db/migrate.js';
import pool from './server/src/db/pool.js';
import { errorHandler, notFoundHandler } from './server/src/middleware/errors.js';
import { getRanker } from './server/src/rankers/index.js';
import { createApiRouter } from './server/src/routes/index.js';
import { seedDemoData } from './server/src/seed/seed.js';
import { expireStaleOffers } from './server/src/services/offers.js';
import { registerSubscribers } from './server/src/services/subscribers.js';

const config = loadConfig(
  process.env.OFFER_TIMEOUT_SECONDS ? {} : { OFFER_TIMEOUT_SECONDS: '8' }
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function bootstrapDatabase() {
  await runMigrations(pool);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM users');
  if (rows[0]?.cnt === 0) {
    await seedDemoData(pool, config);
    console.log('Seeded initial KasuCab demo users and fleet.');
  }
}

async function startServer() {
  if (config.FAIR_DISPATCH_ENABLED !== false) {
    getRanker(config.RANKER);
  }

  await bootstrapDatabase();
  registerSubscribers(pool);

  const app = express();

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key, X-Service-Key'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.json());
  app.use('/api/v1', createApiRouter({ pool, config }));
  app.use('/api', notFoundHandler);

  let vite = null;
  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  } else {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.use(errorHandler);

  let stopping = false;
  let workerTimer: ReturnType<typeof setTimeout> | null = null;

  const runWorkerTick = async () => {
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
        workerTimer = setTimeout(() => void runWorkerTick(), 1000);
      }
    }
  };

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`KasuCab server listening on http://0.0.0.0:${PORT}`);
    void runWorkerTick();
  });

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}, shutting down KasuCab...`);
    if (workerTimer) clearTimeout(workerTimer);
    if (vite) {
      await vite.close().catch(() => {});
    }
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

startServer().catch(async (err) => {
  console.error('Failed to start KasuCab server:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
