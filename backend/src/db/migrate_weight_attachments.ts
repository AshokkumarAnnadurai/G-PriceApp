import { PoolClient } from 'pg';
import { logger } from '../middleware/logger';

export async function migrateWeightAttachments(client: PoolClient): Promise<void> {
  logger.info('Running migration: item_weight_attachments...');
  
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
  logger.info('Migration item_weight_attachments completed.');
}
