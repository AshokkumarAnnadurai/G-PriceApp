import { logger } from '../middleware/logger';
import { pool } from './pool';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(`
      DROP TABLE IF EXISTS vendor_materials_history CASCADE;
      CREATE TABLE IF NOT EXISTS vendor_materials_history (
        id               SERIAL PRIMARY KEY,
        vendor_id        VARCHAR(50) NOT NULL,
        grade            VARCHAR(100) NOT NULL,
        customer_name    VARCHAR(150) NOT NULL DEFAULT 'All',
        casting_code     VARCHAR(100),
        
        old_mmr_rate         NUMERIC(12,4),
        new_mmr_rate         NUMERIC(12,4),
        old_ro_rate          NUMERIC(12,4),
        new_ro_rate          NUMERIC(12,4),
        old_consumables_rate NUMERIC(12,4),
        new_consumables_rate NUMERIC(12,4),
        old_extra_factor     NUMERIC(12,4),
        new_extra_factor     NUMERIC(12,4),
        
        old_rm_weight        NUMERIC(12,4),
        new_rm_weight        NUMERIC(12,4),
        old_revised_rate_per_kg NUMERIC(12,4),
        new_revised_rate_per_kg NUMERIC(12,4),
        old_revised_price    NUMERIC(12,4),
        new_revised_price    NUMERIC(12,4),
        
        from_date        DATE,
        to_date          DATE,
        
        operation        VARCHAR(10) NOT NULL,
        changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

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
            operation
          ) VALUES (
            NEW.vendor_id, NEW.grade, NEW.customer_name, NEW.casting_code,
            NEW.mmr_rate, NEW.ro_rate, NEW.consumables_rate, NEW.extra_factor,
            NEW.rm_weight, NEW.revised_rate_per_kg, NEW.revised_price,
            NEW.from_date, NEW.to_date,
            'INSERT'
          );
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          -- Log if a pricing column or date range actually changed
          IF OLD.mmr_rate IS DISTINCT FROM NEW.mmr_rate OR OLD.ro_rate IS DISTINCT FROM NEW.ro_rate OR OLD.consumables_rate IS DISTINCT FROM NEW.consumables_rate OR OLD.extra_factor IS DISTINCT FROM NEW.extra_factor OR OLD.rm_weight IS DISTINCT FROM NEW.rm_weight OR OLD.revised_rate_per_kg IS DISTINCT FROM NEW.revised_rate_per_kg OR OLD.revised_price IS DISTINCT FROM NEW.revised_price OR OLD.from_date IS DISTINCT FROM NEW.from_date OR OLD.to_date IS DISTINCT FROM NEW.to_date THEN
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
              operation
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
              'UPDATE'
            );
          END IF;
          RETURN NEW;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS vendor_materials_audit ON vendor_materials;
      CREATE TRIGGER vendor_materials_audit
      AFTER INSERT OR UPDATE ON vendor_materials
      FOR EACH ROW EXECUTE PROCEDURE log_vendor_materials_changes();
    `);

    await client.query('COMMIT');
    logger.info('Successfully created vendor_materials_history table and trigger');
  } catch(e) {
    await client.query('ROLLBACK');
    logger.error('Failed to create history table and trigger', e);
  } finally {
    client.release();
    pool.end();
  }
}

run();
