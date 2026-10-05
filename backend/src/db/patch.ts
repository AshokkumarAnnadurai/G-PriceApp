import { pool } from './pool';

async function patch() {
  const client = await pool.connect();
  try {
    console.log('Running patch...');
    await client.query(`
      ALTER TABLE pricing_batches ADD COLUMN IF NOT EXISTS mmr_change NUMERIC(12,4);
      ALTER TABLE pricing_batches ADD COLUMN IF NOT EXISTS coating_change NUMERIC(12,4);
      ALTER TABLE pricing_batches ADD COLUMN IF NOT EXISTS consumables_change NUMERIC(12,4);
      ALTER TABLE pricing_batches ADD COLUMN IF NOT EXISTS extra_change NUMERIC(12,4);
    `);
    console.log('Successfully added missing change columns to pricing_batches table.');
  } catch (err) {
    console.error('Failed to patch database:', err);
  } finally {
    client.release();
  }
}

patch().then(() => process.exit(0)).catch(() => process.exit(1));
