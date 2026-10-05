import { logger } from '../middleware/logger';
import { pool } from './pool';

async function run() {
  logger.info('Running migration: item_weight_attachments...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const sql = `
      CREATE TABLE IF NOT EXISTS item_weight_attachments (
          id SERIAL PRIMARY KEY,
          item_code VARCHAR(100) NOT NULL,
          category VARCHAR(100) NOT NULL,
          slot_index INT NOT NULL,
          weight NUMERIC(12, 4) NOT NULL DEFAULT 0,
          image_path VARCHAR(500),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(item_code, category, slot_index)
      );
    `;
    await client.query(sql);
    
    await client.query('COMMIT');
    logger.info('Migration item_weight_attachments completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
