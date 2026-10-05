import { logger } from '../middleware/logger';
import { pool } from './pool';

async function addIndexes() {
  const client = await pool.connect();
  try {
    logger.info('Adding optimized indexes for SAP mirroring tables...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_oitm_itemcode ON oitm (TRIM("ItemCode"));
      CREATE INDEX IF NOT EXISTS idx_oitm_valid_type ON oitm (TRIM("validFor"), TRIM("ItemType"));
      CREATE INDEX IF NOT EXISTS idx_oitm_grade ON oitm (TRIM("U_Grade"));
      CREATE INDEX IF NOT EXISTS idx_oitm_group ON oitm ("ItmsGrpCod");
      CREATE INDEX IF NOT EXISTS idx_ospp_itemcode ON ospp_sftp (TRIM(itemcode));
      CREATE INDEX IF NOT EXISTS idx_ospp_cardcode ON ospp_sftp (TRIM(cardcode));
      CREATE INDEX IF NOT EXISTS idx_oitm_domeexpo ON oitm (TRIM("U_DomeExpo"));
      CREATE INDEX IF NOT EXISTS idx_oitm_frgnname ON oitm ("FrgnName");
    `);
    logger.info('Successfully added expression indexes.');
  } catch (error) {
    logger.error('Failed to add indexes:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addIndexes();
