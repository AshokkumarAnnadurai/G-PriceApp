import { logger } from '../middleware/logger';
import { pool } from './pool';

async function runMigration() {
  logger.info('Running custom migration for vendor_materials_history metadata fields...');
  const client = pool;

  try {
    // 1. Add columns to vendor_materials_history table if they do not exist
    await client.query(`
      ALTER TABLE vendor_materials_history 
      ADD COLUMN IF NOT EXISTS item_code VARCHAR(100),
      ADD COLUMN IF NOT EXISTS item_description VARCHAR(255),
      ADD COLUMN IF NOT EXISTS machine_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS coating VARCHAR(100),
      ADD COLUMN IF NOT EXISTS cavity VARCHAR(100),
      ADD COLUMN IF NOT EXISTS core_sleeve VARCHAR(100);
    `);
    logger.info('Successfully verified/added metadata columns to vendor_materials_history.');

    // 2. Re-define the log_vendor_materials_changes trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION log_vendor_materials_changes()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Check if an identical history entry already exists for this period to avoid duplicate logs
        IF EXISTS (
          SELECT 1 FROM vendor_materials_history
          WHERE vendor_id = NEW.vendor_id::varchar
            AND grade = NEW.grade
            AND customer_name = NEW.customer_name
            AND COALESCE(casting_code, '') = COALESCE(NEW.casting_code, '')
            AND from_date = NEW.from_date
            AND to_date = NEW.to_date
            AND COALESCE(new_mmr_rate, 0) = COALESCE(NEW.mmr_rate, 0)
            AND COALESCE(new_ro_rate, 0) = COALESCE(NEW.ro_rate, 0)
            AND COALESCE(new_consumables_rate, 0) = COALESCE(NEW.consumables_rate, 0)
            AND COALESCE(new_extra_factor, 0) = COALESCE(NEW.extra_factor, 0)
            AND COALESCE(new_rm_weight, 0) = COALESCE(NEW.rm_weight, 0)
            AND COALESCE(new_revised_rate_per_kg, 0) = COALESCE(NEW.revised_rate_per_kg, 0)
        ) THEN
          RETURN NEW;
        END IF;

        IF TG_OP = 'INSERT' THEN
          INSERT INTO vendor_materials_history (
            vendor_id, grade, customer_name, casting_code,
            new_mmr_rate, new_ro_rate, new_consumables_rate, new_extra_factor,
            new_rm_weight, new_revised_rate_per_kg, new_revised_price,
            from_date, to_date,
            operation,
            item_code, item_description, machine_type, coating, cavity, core_sleeve
          ) VALUES (
            NEW.vendor_id, NEW.grade, NEW.customer_name, NEW.casting_code,
            NEW.mmr_rate, NEW.ro_rate, NEW.consumables_rate, NEW.extra_factor,
            NEW.rm_weight, NEW.revised_rate_per_kg, NEW.revised_price,
            NEW.from_date, NEW.to_date,
            'INSERT',
            NEW.item_code, NEW.item_description, NEW.machine_type, NEW.coating, NEW.cavity, NEW.core_sleeve
          );
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          -- Log if a pricing column, date range, or metadata columns changed
          IF OLD.mmr_rate IS DISTINCT FROM NEW.mmr_rate OR OLD.ro_rate IS DISTINCT FROM NEW.ro_rate OR OLD.consumables_rate IS DISTINCT FROM NEW.consumables_rate OR OLD.extra_factor IS DISTINCT FROM NEW.extra_factor OR OLD.rm_weight IS DISTINCT FROM NEW.rm_weight OR OLD.revised_rate_per_kg IS DISTINCT FROM NEW.revised_rate_per_kg OR OLD.revised_price IS DISTINCT FROM NEW.revised_price OR OLD.from_date IS DISTINCT FROM NEW.from_date OR OLD.to_date IS DISTINCT FROM NEW.to_date OR OLD.machine_type IS DISTINCT FROM NEW.machine_type OR OLD.coating IS DISTINCT FROM NEW.coating OR OLD.cavity IS DISTINCT FROM NEW.cavity OR OLD.core_sleeve IS DISTINCT FROM NEW.core_sleeve OR OLD.item_code IS DISTINCT FROM NEW.item_code OR OLD.item_description IS DISTINCT FROM NEW.item_description THEN
            INSERT INTO vendor_materials_history (
              vendor_id, grade, customer_name, casting_code,
              old_mmr_rate, new_mmr_rate,
              old_ro_rate, new_ro_rate,
              old_consumables_rate, new_consumables_rate,
              old_extra_factor, new_extra_factor,
              old_rm_weight, new_rm_weight,
              old_revised_rate_per_kg, new_revised_rate_per_kg,
              old_revised_price, new_revised_price,
              from_date, to_date,
              operation,
              item_code, item_description, machine_type, coating, cavity, core_sleeve
            ) VALUES (
              NEW.vendor_id, NEW.grade, NEW.customer_name, NEW.casting_code,
              OLD.mmr_rate, NEW.mmr_rate,
              OLD.ro_rate, NEW.ro_rate,
              OLD.consumables_rate, NEW.consumables_rate,
              OLD.extra_factor, NEW.extra_factor,
              OLD.rm_weight, NEW.rm_weight,
              OLD.revised_rate_per_kg, NEW.revised_rate_per_kg,
              OLD.revised_price, NEW.revised_price,
              NEW.from_date, NEW.to_date,
              'UPDATE',
              NEW.item_code, NEW.item_description, NEW.machine_type, NEW.coating, NEW.cavity, NEW.core_sleeve
            );
          END IF;
          RETURN NEW;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    logger.info('Successfully updated log_vendor_materials_changes trigger function.');
    logger.info('Migration finished successfully!');
  } catch (err) {
    logger.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
