import { query } from './pool';

async function run() {
  try {
    console.log('Starting CONCURRENT index creation to speed up trimmed queries without locking tables...');
    
    // Note: CONCURRENTLY cannot run inside a transaction block. Our pool.query execution runs each statement in its own transaction context.
    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_por1_itemcode_trim ON por1 (TRIM("ItemCode"))');
    console.log('Created index on por1 (TRIM("ItemCode"))');

    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_opor_cardcode_trim ON opor (TRIM("CardCode"))');
    console.log('Created index on opor (TRIM("CardCode"))');

    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oitm_itemcode_trim ON oitm (TRIM("ItemCode"))');
    console.log('Created index on oitm (TRIM("ItemCode"))');

    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ocrd_cardcode_trim ON ocrd (TRIM("CardCode"))');
    console.log('Created index on ocrd (TRIM("CardCode"))');

    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ospp_itemcode_trim ON ospp_sftp (TRIM(itemcode))');
    console.log('Created index on ospp_sftp (TRIM(itemcode))');

    await query('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ospp_cardcode_trim ON ospp_sftp (TRIM(cardcode))');
    console.log('Created index on ospp_sftp (TRIM(cardcode))');

    console.log('All functional indexes created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create indexes:', err);
    process.exit(1);
  }
}

run();
