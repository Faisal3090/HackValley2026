import net from 'node:net';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import config from '../config/index.js';

const { Pool } = pg;

export function getConnectionString(cfg = config) {
  if (cfg.NODE_ENV === 'test' && cfg.TEST_DATABASE_URL) {
    return cfg.TEST_DATABASE_URL;
  }
  return cfg.DATABASE_URL;
}

function isTcpReachable(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function parsePgTarget(connectionString) {
  try {
    const u = new URL(connectionString);
    return {
      host: u.hostname || 'localhost',
      port: Number(u.port || 5432),
      dbName: (u.pathname || '').replace(/^\//, ''),
    };
  } catch {
    return { host: 'localhost', port: 5432, dbName: 'ridematch' };
  }
}

async function runPgliteQuery(db, text, params) {
  if (Array.isArray(params) && params.length > 0) {
    const res = await db.query(text, params);
    return {
      rows: res.rows || [],
      rowCount: res.affectedRows ?? (res.rows ? res.rows.length : 0),
    };
  }

  const trimmed = String(text || '').trim();
  const hasMultipleStatements =
    trimmed.includes(';') &&
    trimmed.indexOf(';') < trimmed.length - 1;

  if (hasMultipleStatements) {
    const results = await db.exec(text);
    const last = Array.isArray(results) && results.length > 0 ? results[results.length - 1] : {};
    return {
      rows: last.rows || [],
      rowCount: last.affectedRows ?? (last.rows ? last.rows.length : 0),
    };
  }

  const res = await db.query(text);
  return {
    rows: res.rows || [],
    rowCount: res.affectedRows ?? (res.rows ? res.rows.length : 0),
  };
}

const sharedPgliteRegistry = new Map();

function getSharedPgliteAdapter(registryKey, dataDir) {
  let entry = sharedPgliteRegistry.get(registryKey);
  if (entry) {
    entry.refCount += 1;
    return entry.adapter;
  }

  let dbPromise = null;
  let lockChain = Promise.resolve();

  const getDb = () => {
    if (!dbPromise) {
      dbPromise = PGlite.create(dataDir);
    }
    return dbPromise;
  };

  const acquireLock = () => {
    let release;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    const prev = lockChain;
    lockChain = lockChain.then(() => next);
    return prev.then(() => {
      let released = false;
      return () => {
        if (!released) {
          released = true;
          release();
        }
      };
    });
  };

  const adapter = {
    async query(text, params) {
      const release = await acquireLock();
      try {
        const db = await getDb();
        return await runPgliteQuery(db, text, params);
      } finally {
        release();
      }
    },

    async connect() {
      const release = await acquireLock();
      try {
        const db = await getDb();
        return {
          query: (text, params) => runPgliteQuery(db, text, params),
          release,
        };
      } catch (err) {
        release();
        throw err;
      }
    },

    async end() {
      entry.refCount -= 1;
      if (entry.refCount > 0) return;

      sharedPgliteRegistry.delete(registryKey);
      const release = await acquireLock();
      try {
        if (dbPromise) {
          const db = await dbPromise;
          await db.close();
          dbPromise = null;
        }
      } finally {
        release();
      }
    },
  };

  entry = { refCount: 1, adapter };
  sharedPgliteRegistry.set(registryKey, entry);
  return adapter;
}

export function createPool(connectionString = getConnectionString()) {
  const { host, port, dbName } = parsePgTarget(connectionString);
  const isTestTarget =
    process.env.NODE_ENV === 'test' || dbName.endsWith('_test');

  let backendPromise = null;

  const getBackend = () => {
    if (!backendPromise) {
      backendPromise = (async () => {
        const forceEmbedded = process.env.USE_EMBEDDED_PG === 'true';
        const reachable = !forceEmbedded && (await isTcpReachable(host, port));

        if (reachable) {
          const pgPool = new Pool({ connectionString, max: 10 });
          pgPool.on('error', (err) => {
            console.error('Unexpected PostgreSQL pool error:', err);
          });
          return pgPool;
        }

        const dataDir = isTestTarget
          ? 'memory://'
          : path.resolve(process.cwd(), '.pgdata');
        const registryKey = isTestTarget ? `test:${dbName || 'default'}` : `file:${dataDir}`;
        return getSharedPgliteAdapter(registryKey, dataDir);
      })();
    }
    return backendPromise;
  };

  return {
    async query(text, params) {
      const backend = await getBackend();
      return backend.query(text, params);
    },

    async connect() {
      const backend = await getBackend();
      return backend.connect();
    },

    async end() {
      if (!backendPromise) return;
      const backend = await backendPromise;
      await backend.end();
      backendPromise = null;
    },
  };
}

export const pool = createPool();
export default pool;

