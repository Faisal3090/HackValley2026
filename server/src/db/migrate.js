import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import defaultPool from './pool.js';
import { withTransaction } from './tx.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations(pool = defaultPool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRes = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map((r) => r.filename));

  const newlyApplied = [];
  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename]
      );
    }, pool);
    newlyApplied.push(filename);
    console.log(`Applied migration: ${filename}`);
  }

  return newlyApplied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then((applied) => {
      if (applied.length === 0) {
        console.log('No pending migrations.');
      }
      return defaultPool.end();
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await defaultPool.end();
      process.exit(1);
    });
}
