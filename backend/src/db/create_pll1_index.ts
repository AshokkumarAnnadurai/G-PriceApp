import { query } from './pool';

async function run() {
  try {
    console.log('Creating CONCURRENT index on custom table argit_pll1 (U_ItemNo)...');
    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_argit_pll1_itemno_trim ON "argit_pll1" (TRIM("U_ItemNo"))');
    console.log('Created index on argit_pll1 (TRIM("U_ItemNo"))');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create index on argit_pll1:', err);
    process.exit(1);
  }
}
run();
