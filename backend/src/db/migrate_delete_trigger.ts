import { logger } from '../middleware/logger';
import { pool } from './pool';

async function runMigration() {
  logger.info('Running migration to implement automatic deletion cascade on vendor_materials_history...');
  const client = pool;

  try {
    // 1. Create or replace the delete trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION delete_vendor_materials_history()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Delete from vendor_materials_history
        DELETE FROM vendor_materials_history
        WHERE vendor_id = OLD.vendor_id::varchar
          AND COALESCE(item_code, '') = COALESCE(OLD.item_code, '')
          AND COALESCE(casting_code, '') = COALESCE(OLD.casting_code, '')
          AND customer_name = OLD.customer_name;

        -- Delete from item_price_history
        DELETE FROM item_price_history
        WHERE vendor_id = OLD.vendor_id::varchar
          AND (TRIM(item_code) = COALESCE(OLD.item_code, '') OR TRIM(casting_code) = COALESCE(OLD.casting_code, ''))
          AND customer_name = OLD.customer_name;

        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);
    logger.info('Created delete_vendor_materials_history function.');

    // 2. Drop the trigger if it already exists, then create it
    await client.query(`
      DROP TRIGGER IF EXISTS trg_delete_vendor_materials_history ON vendor_materials;
      
      CREATE TRIGGER trg_delete_vendor_materials_history
      AFTER DELETE ON vendor_materials
      FOR EACH ROW
      EXECUTE FUNCTION delete_vendor_materials_history();
    `);
    logger.info('Successfully created trg_delete_vendor_materials_history trigger on vendor_materials.');
    logger.info('Migration finished successfully!');
  } catch (err) {
    logger.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
