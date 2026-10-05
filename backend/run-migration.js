const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'pricing_app',
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Adding columns...');
    await client.query(`
      ALTER TABLE vendor_materials
      ADD COLUMN IF NOT EXISTS groupcode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS groupname VARCHAR(100);
    `);
    console.log('✅ Columns added');

    console.log('Backfilling existing rows...');
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
    console.log(`✅ Updated ${result.rowCount} rows`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();
