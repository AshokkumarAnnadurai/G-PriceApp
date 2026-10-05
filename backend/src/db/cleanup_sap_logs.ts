/**
 * Cleanup old SAP log tables - keep only sap_sync_tracking
 */

import { logger } from '../middleware/logger';
import { query } from './pool';

export async function cleanupOldSapLogTables() {
  try {
    // Drop old unused tables
    await query(`
      DROP TABLE IF EXISTS sap_push_log CASCADE;
      DROP TABLE IF EXISTS sap_sync_log CASCADE;
    `);
    logger.info('Dropped old SAP log tables (sap_push_log, sap_sync_log)');
  } catch (err) {
    logger.error('Failed to cleanup old SAP log tables:', err);
  }
}
