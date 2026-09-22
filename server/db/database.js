import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

let pool = null;
let pgliteInstance = null;
let activeEngine = 'none';

// Initialize the database connection
export async function getDbClient() {
  if (databaseUrl) {
    if (!pool) {
      const sslConfig = (isProduction || databaseUrl.includes('sslmode=require') || databaseUrl.includes('neon.tech') || databaseUrl.includes('render.com'))
        ? { rejectUnauthorized: false }
        : false;

      pool = new pg.Pool({
        connectionString: databaseUrl,
        max: parseInt(process.env.PG_MAX_CONNECTIONS || '20', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: sslConfig
      });

      pool.on('error', (err) => {
        console.error('[PostgreSQL Pool Error]', err);
      });

      activeEngine = 'pg-pool';
      console.log(`[Database] Connected to PostgreSQL via connection pool (${databaseUrl.split('@')[1] || 'remote'})`);
    }
    return pool;
  }

  // Prevent accidental fallback to embedded PGlite in production
  if (isProduction) {
    throw new Error('FATAL: DATABASE_URL environment variable is strictly required in production mode! Embedded PGlite cannot be used in production.');
  }

  // Fallback to embedded real PostgreSQL engine (PGlite) for local dev & testing
  if (!pgliteInstance) {
    const { PGlite } = await import('@electric-sql/pglite');
    const pgDataDir = process.env.PG_DATA_DIR
      ? path.resolve(process.env.PG_DATA_DIR)
      : path.resolve(__dirname, '../data/pgdata');

    if (!fs.existsSync(pgDataDir)) {
      fs.mkdirSync(pgDataDir, { recursive: true });
    }

    pgliteInstance = new PGlite(process.env.TEST_MEMORY_DB === 'true' ? undefined : pgDataDir);
    activeEngine = 'pglite-embedded';
    console.log(`[Database] Initialized embedded PostgreSQL (PGlite) at ${pgDataDir}`);
  }

  return pgliteInstance;
}

// Unified query runner with parameters
export async function query(text, params = []) {
  const client = await getDbClient();

  // Normalize undefined params to null for PostgreSQL compatibility
  const sanitizedParams = params.map(p => (p === undefined ? null : p));

  if (activeEngine === 'pg-pool') {
    return client.query(text, sanitizedParams);
  } else {
    // PGlite interface
    const res = await client.query(text, sanitizedParams);
    return {
      rows: res.rows || [],
      rowCount: res.affectedRows !== undefined ? res.affectedRows : (res.rows ? res.rows.length : 0),
      fields: res.fields || []
    };
  }
}

// Safe transaction runner with automatic BEGIN / COMMIT / ROLLBACK
export async function transaction(callback) {
  const client = await getDbClient();

  if (activeEngine === 'pg-pool') {
    const connection = await client.connect();
    try {
      await connection.query('BEGIN');
      const txClient = {
        query: (sql, p = []) => connection.query(sql, p.map(v => v === undefined ? null : v))
      };
      const result = await callback(txClient);
      await connection.query('COMMIT');
      return result;
    } catch (err) {
      await connection.query('ROLLBACK');
      throw err;
    } finally {
      connection.release();
    }
  } else {
    // PGlite transaction
    try {
      await client.query('BEGIN');
      const txClient = {
        query: async (sql, p = []) => {
          const res = await client.query(sql, p.map(v => v === undefined ? null : v));
          return {
            rows: res.rows || [],
            rowCount: res.affectedRows !== undefined ? res.affectedRows : (res.rows ? res.rows.length : 0)
          };
        }
      };
      const result = await callback(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
}

// Database health check
export async function checkHealth() {
  try {
    const startTime = Date.now();
    const res = await query('SELECT NOW() as current_time, version() as version');
    const latencyMs = Date.now() - startTime;
    return {
      ok: true,
      engine: activeEngine,
      latencyMs,
      time: res.rows[0]?.current_time,
      version: res.rows[0]?.version
    };
  } catch (error) {
    return {
      ok: false,
      engine: activeEngine,
      error: error.message
    };
  }
}

let drizzleDb = null;

// Returns cached Drizzle ORM instance bound to current PostgreSQL client
export async function getDrizzle() {
  if (!drizzleDb) {
    const client = await getDbClient();
    const { default: schema } = await import('./drizzleSchema.js');
    if (activeEngine === 'pg-pool') {
      const { drizzle } = await import('drizzle-orm/node-postgres');
      drizzleDb = drizzle(client, { schema });
    } else {
      const { drizzle } = await import('drizzle-orm/pglite');
      drizzleDb = drizzle(client, { schema });
    }
  }
  return drizzleDb;
}

// Graceful shutdown
export async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
  drizzleDb = null;
  activeEngine = 'none';
  console.log('[Database] Database connection closed.');
}

// Backward-compatible query wrapper matching db.query / db.prepare style
export const db = {
  query,
  transaction,
  checkHealth,
  close,
  getDrizzle,
  getEngine: () => activeEngine
};

export default db;
