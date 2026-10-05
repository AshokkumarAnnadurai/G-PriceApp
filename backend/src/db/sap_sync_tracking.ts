/**
 * SAP Sync Tracking - log all SAP push operations
 */

import { logger } from '../middleware/logger';
import { query } from './pool';

export async function logSapPush(
  itemCode: string,
  cardCode: string,
  type: 'customer' | 'vendor',
  operationType: 'POST' | 'PATCH' | 'SKIP',
  syncStatus: 'success' | 'failure',
  vendorName?: string | null,
  customerName?: string | null,
  errorMessage?: string | null,
  sapResponse?: any
) {
  try {
    await query(
      `INSERT INTO sap_sync_tracking
       (item_code, cardcode, type, vendor_name, customer_name, operation_type, sync_status, error_message, sap_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        itemCode,
        cardCode,
        type,
        type === 'vendor' ? vendorName : null,
        type === 'customer' ? customerName : null,
        operationType,
        syncStatus,
        errorMessage || null,
        JSON.stringify(sapResponse) || null
      ]
    );
  } catch (err) {
    logger.error('Failed to log SAP push:', err);
  }
}

export async function getLatestPushDate(itemCode: string, cardCode: string, type: 'customer' | 'vendor') {
  try {
    const rows = await query<{ pushed_at: string }>(
      `SELECT pushed_at FROM sap_sync_tracking
       WHERE item_code = $1 AND cardcode = $2 AND type = $3 AND sync_status = 'success'
       ORDER BY pushed_at DESC LIMIT 1`,
      [itemCode, cardCode, type]
    );
    return rows[0]?.pushed_at || null;
  } catch (err) {
    logger.error('Failed to get latest push date:', err);
    return null;
  }
}

export async function getSyncStatus(itemCode?: string) {
  try {
    let sql = 'SELECT * FROM sap_sync_tracking';
    const params: any[] = [];

    if (itemCode) {
      sql += ' WHERE item_code = $1';
      params.push(itemCode);
    }

    sql += ' ORDER BY pushed_at DESC';

    const result = await query(sql, params);
    return result;
  } catch (err) {
    logger.error('Failed to get sync status:', err);
    return [];
  }
}
