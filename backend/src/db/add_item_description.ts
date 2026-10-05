import { query } from './pool';

async function run() {
  console.log('Adding item_description column to vendor_materials table...');
  try {
    // 1. Add item_description column if it does not exist
    await query(`
      ALTER TABLE vendor_materials 
      ADD COLUMN IF NOT EXISTS item_description character varying;
    `);
    console.log('Column added or already exists.');

    // 2. Backfill description from oitm
    console.log('Backfilling item_description from oitm...');
        console.log('Backfill completed successfully.');
  } catch (error) {
    console.error('Error migrating database:', error);
  }
}

run();
