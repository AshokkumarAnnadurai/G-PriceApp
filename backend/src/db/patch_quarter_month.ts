import { logger } from '../middleware/logger';
import { pool } from './pool';

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_materials' AND column_name='quarter_and_month') THEN
          ALTER TABLE vendor_materials ADD COLUMN quarter_and_month VARCHAR(50);
        END IF;
      END
      $$;
    `);
    logger.info('Added quarter_and_month to vendor_materials');
  } catch(e) {
    logger.error('Failed', e);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
