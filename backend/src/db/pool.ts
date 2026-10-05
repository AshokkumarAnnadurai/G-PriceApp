import { Pool,types } from 'pg';
import { config } from '../config';
import { logger } from '../middleware/logger';

// Force DATE columns (OID 1082) to be parsed as raw strings (e.g. 'YYYY-MM-DD')
// instead of JavaScript Date objects, which avoids timezone shifting on JSON serialization.
types.setTypeParser(1082, (val) => val);

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle DB client', err);
});

export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
