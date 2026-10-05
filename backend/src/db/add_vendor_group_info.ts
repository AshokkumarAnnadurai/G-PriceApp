import { logger } from '../middleware/logger';
import { pool } from './pool';

let migrationDone = false;

export async function addVendorGroupInfo() {
  if (migrationDone) return;

  const client = await pool.connect();
  try {
    logger.info('Adding groupcode and groupname columns to vendor_materials...');

    await client.query(`
      ALTER TABLE vendor_materials
      ADD COLUMN IF NOT EXISTS groupcode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS groupname VARCHAR(100);
    `);

    logger.info('Columns added successfully');

    const result = await client.query(`
      UPDATE vendor_materials vm
      SET
        groupcode = o.groupcode,
        groupname = og.groupname
      FROM ocrd_sftp o
      LEFT JOIN ocrg_sftp og ON TRIM(og.groupcode) = TRIM(o.groupcode)
      WHERE TRIM(o.cardcode) = TRIM(vm.vendor_id)
      AND vm.groupcode IS NULL;
    `);

    logger.info(`Backfill completed. Updated ${result.rowCount} rows`);
    migrationDone = true;
  } catch (err) {
    logger.error('Error adding vendor group info:', err);
    throw err;
  } finally {
    client.release();
  }
}
