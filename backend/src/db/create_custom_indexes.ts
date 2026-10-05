import { query } from './pool';

async function run() {
  try {
    console.log('Creating functional indexes on custom tables aargit_ple1 and aargit_bpe1...');

    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_aargit_ple1_itemno_trim ON "aargit_ple1" (TRIM("U_ItemNo"))');
    console.log('Created index on aargit_ple1 (TRIM("U_ItemNo"))');

    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_aargit_bpe1_itemno_trim ON "aargit_bpe1" (TRIM("U_ItemNo"))');
    console.log('Created index on aargit_bpe1 (TRIM("U_ItemNo"))');

    console.log('Custom table index optimization completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create indexes on custom tables:', err);
    process.exit(1);
  }
}

run();
