import { pool } from './pool';

async function run() {
  const client = await pool.connect();
  try {
    console.log('Migrating vendor_materials columns...');
    await client.query('BEGIN');

    // Add new columns to vendor_materials table if they don't exist
    await client.query(`
      ALTER TABLE vendor_materials 
      ADD COLUMN IF NOT EXISTS machine_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS coating VARCHAR(100),
      ADD COLUMN IF NOT EXISTS cavity VARCHAR(100),
      ADD COLUMN IF NOT EXISTS core_sleeve VARCHAR(100);
    `);

    await client.query('COMMIT');
    console.log('Successfully added new columns to vendor_materials table.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
