import express from 'express';
import defaultConfig from './config/index.js';
import defaultPool from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { getRanker } from './rankers/index.js';
import { createApiRouter } from './routes/index.js';
import { registerSubscribers } from './services/subscribers.js';

export function createApp({ pool = defaultPool, config = defaultConfig } = {}) {
  if (config.FAIR_DISPATCH_ENABLED !== false) {
    getRanker(config.RANKER);
  }

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

  registerSubscribers(pool);

  app.use('/api/v1', createApiRouter({ pool, config }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
