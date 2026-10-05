import { Request,Response } from 'express';
import { query } from '../db/pool';
import { logger } from '../middleware/logger';
import { sendError,sendSuccess } from '../middleware/response';
import { CustomerPriceUpdate,getSapClient,VendorPriceUpdate } from '../services/sapSyncService';
import { logSapPush } from '../db/sap_sync_tracking';

/**
 * SAP Sync Controller
 * Handles pricing pushes to SAP HANA OSPP table
 */

/**
 * Push vendor pricing to SAP
 *
 * POST /api/sap/sync/vendor-price
 * Body: { itemCode, vendorCode, castingPrice, validFrom, validTo }
 */
export async function pushVendorPrice(req: Request, res: Response) {
  try {
    const { itemCode, vendorCode, castingPrice, validFrom, validTo } = req.body;

    if (!itemCode || !vendorCode || castingPrice === undefined) {
      return sendError(res, 'Missing required fields: itemCode, vendorCode, castingPrice', 400);
    }

    const sapClient = getSapClient();
    if (!sapClient) {
      return sendError(res, 'SAP sync not configured', 503);
    }

    const update: VendorPriceUpdate = {
      itemCode,
      vendorCode,
      castingPrice: Number(castingPrice),
      validFrom: validFrom || new Date().toISOString().split('T')[0],
      validTo: validTo || '2099-12-31'
    };

    const result = await sapClient.syncVendorPrice(update);

    if (result.success) {
      // Log to audit trail
      // await logSapSync('vendor', itemCode, vendorCode, castingPrice, validFrom, validTo, true);
      return sendSuccess(res, result, 200, 'Vendor price pushed to SAP');
    } else {
      // await logSapSync('vendor', itemCode, vendorCode, castingPrice, validFrom, validTo, false, result.error);
      return sendError(res, result.message, 400);
    }
  } catch (err) {
    logger.error('pushVendorPrice error:', err);
    sendError(res, 'Failed to push vendor price to SAP', 500);
  }
}

/**
 * Push customer pricing to SAP
 *
 * POST /api/sap/sync/customer-price
 * Body: { itemCode, customerCode, finalPrice, validFrom, validTo }
 */
export async function pushCustomerPrice(req: Request, res: Response) {
  try {
    const { itemCode, customerCode, finalPrice, validFrom, validTo } = req.body;

    if (!itemCode || !customerCode || finalPrice === undefined) {
      return sendError(res, 'Missing required fields: itemCode, customerCode, finalPrice', 400);
    }

    const sapClient = getSapClient();
    if (!sapClient) {
      return sendError(res, 'SAP sync not configured', 503);
    }

    const update: CustomerPriceUpdate = {
      itemCode,
      customerCode,
      finalPrice: Number(finalPrice),
      validFrom: validFrom || new Date().toISOString().split('T')[0],
      validTo: validTo || '2099-12-31'
    };

    const result = await sapClient.syncCustomerPrice(update);

    if (result.success) {
      // Log to audit trail
      // await logSapSync('customer', itemCode, customerCode, finalPrice, validFrom, validTo, true);
      return sendSuccess(res, result, 200, 'Customer price pushed to SAP');
    } else {
      // await logSapSync('customer', itemCode, customerCode, finalPrice, validFrom, validTo, false, result.error);
      return sendError(res, result.message, 400);
    }
  } catch (err) {
    logger.error('pushCustomerPrice error:', err);
    sendError(res, 'Failed to push customer price to SAP', 500);
  }
}

/**
 * Push all approved prices from batch to SAP
 *
 * POST /api/sap/sync/batch/:batchId
 * Pushes all approved items in a batch to SAP
 */
export async function pushBatchToSap(req: Request, res: Response) {
  try {
    const { batchId } = req.params;

    const sapClient = getSapClient();
    if (!sapClient) {
      return sendError(res, 'SAP sync not configured', 503);
    }

    // Fetch all approved items in batch with vendor info
    const batchItems = await query<any>(
      `SELECT
        pbi.item_code, pbi.casting_code,
        pbi.new_price, pbi.old_price,
        pbi.customer_name, pbi.customer_code, pbi.customer_rate_per_kg, pbi.customer_total_price,
        pb.vendor_id, pb.from_date, pb.to_date
       FROM pricing_batch_items pbi
       JOIN pricing_batches pb ON pbi.batch_id = pb.id
       WHERE pbi.batch_id = $1 AND pbi.status = 'approved'`,
      [batchId]
    );

    if (!batchItems || batchItems.length === 0) {
      return sendError(res, 'No approved items found in batch', 404);
    }

    // Prepare updates for vendor and customer modes
    const vendorUpdates: VendorPriceUpdate[] = [];
    const customerUpdates: CustomerPriceUpdate[] = [];

    for (const item of batchItems) {
      const validFrom = item.from_date || new Date().toISOString().split('T')[0];
      const validTo = item.to_date || '2099-12-31';

      // Vendor pricing: ItemCode + VendorId → CastingPrice
      if (item.vendor_id) {
        vendorUpdates.push({
          itemCode: item.item_code,
          vendorCode: item.vendor_id,
          castingPrice: Number(item.new_price),
          validFrom,
          validTo
        });
      }

      // Customer pricing: ItemCode + CustomerName → FinalPrice
      if (item.customer_code) {
        customerUpdates.push({
          itemCode: item.item_code.trim(),
          customerCode: item.customer_code.trim(),
          finalPrice: Number(item.customer_total_price || item.new_price),
          validFrom,
          validTo
        });
      }
    }

    // Execute batch sync
    const results = await sapClient.syncBatch(vendorUpdates, customerUpdates);

    const successCount = results.vendor.filter(r => r.success).length +
                        results.customer.filter(r => r.success).length;
    const failureCount = results.vendor.filter(r => !r.success).length +
                        results.customer.filter(r => !r.success).length;

    logger.info(`Batch ${batchId} sync: ${successCount} succeeded, ${failureCount} failed`);

    return sendSuccess(res, {
      batchId,
      vendorResults: results.vendor,
      customerResults: results.customer,
      summary: {
        total: vendorUpdates.length + customerUpdates.length,
        succeeded: successCount,
        failed: failureCount
      }
    }, 200, `Batch sync complete: ${successCount} succeeded, ${failureCount} failed`);

  } catch (err) {
    logger.error('pushBatchToSap error:', err);
    sendError(res, 'Failed to sync batch to SAP', 500);
  }
}

/**
 * Push approved items from v_approved_audit_prices to SAP
 *
 * POST /api/sap/sync/approved-items
 * Body: { customerCode?, vendorId?, itemCode? }
 * Fetches ALL approved items from v_approved_audit_prices and pushes to SAP
 * Only pushes final_price (for customers) and casting_price (for vendors)
 */
export async function pushApprovedItemsToSap(req: Request, res: Response) {
  try {
    const { customerCode, vendorId, itemCode, sapExistenceData = [], vendorsData = [], date } = req.body;

    logger.info(`[PUSH TO SAP] Starting push with filters: customerCode=${customerCode}, vendorId=${vendorId}, itemCode=${itemCode}, date=${date}`);

    // Parse the date parameter (YYYY-MM format) to filter vendors by date overlap
    let filterDate: Date | null = null;
    if (date) {
      const [year, month] = date.split('-');
      filterDate = new Date(`${year}-${month}-01T00:00:00Z`);
      logger.info(`[PUSH TO SAP] Filter date parsed: ${filterDate.toISOString()}`);
    }

    const sapClient = getSapClient();
    if (!sapClient) {
      logger.error('[PUSH TO SAP] SAP client not configured');
      return sendError(res, 'SAP sync not configured', 503);
    }

    // Use vendorsData from frontend (contains only active vendors for each customer)
    // If vendorsData is provided, use it; otherwise fall back to database query
    let approvedItems: any[] = [];

    if (vendorsData && vendorsData.length > 0) {
      logger.info(`[PUSH TO SAP] Using vendorsData from frontend (${vendorsData.length} items)`);

      // Process vendorsData to build approved items + vendors
      approvedItems = [];

      for (const item of vendorsData) {
        // Add customer row
        approvedItems.push({
          item_code: item.item_code,
          casting_code: item.casting_code,
          customer_code: item.customer_code,
          vendor_id: null,
          type: 'customer',
          final_price: item.final_price,
          valid_from: item.valid_from,
          valid_through: item.valid_through
        });

        // Add vendors from the item's vendors JSON
        let vendors = item.vendors;
        if (typeof vendors === 'string') {
          try {
            vendors = JSON.parse(vendors);
          } catch {
            vendors = [];
          }
        }
        if (Array.isArray(vendors)) {
          vendors.forEach((vendor: any) => {
            // Filter vendors by date overlap if date is provided
            if (filterDate) {
              const vendorValidFrom = vendor.valid_from ? new Date(vendor.valid_from) : null;
              const vendorValidTo = vendor.valid_through ? new Date(vendor.valid_through) : null;

              if (!vendorValidFrom || !vendorValidTo) {
                logger.debug(`[PUSH TO SAP] Skipping vendor ${vendor.id} - missing dates`);
                return; // Skip vendors without dates
              }

              // Check if filterDate falls within vendor's valid range
              if (filterDate < vendorValidFrom || filterDate > vendorValidTo) {
                logger.debug(`[PUSH TO SAP] Skipping vendor ${vendor.id} - date ${date} outside valid range ${vendor.valid_from} to ${vendor.valid_through}`);
                return; // Skip vendors not active on this date
              }
            }

            approvedItems.push({
              item_code: item.item_code,
              casting_code: item.casting_code,
              customer_code: item.customer_code,
              vendor_id: vendor.id,
              type: 'vendor',
              final_price: vendor.revised_price || vendor.final_price,
              valid_from: vendor.valid_from,
              valid_through: vendor.valid_through
            });
          });
        }
      }
    } else {
      logger.info('[PUSH TO SAP] vendorsData not provided, falling back to database query');

      // Fallback: Query database
      const conditions: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (customerCode) {
        conditions.push(`vap.customer_code = $${paramCount}`);
        params.push(customerCode);
        paramCount++;
      }

      if (vendorId) {
        conditions.push(`vap.vendor_id = $${paramCount}`);
        params.push(vendorId);
        paramCount++;
      }

      if (itemCode) {
        conditions.push(`vap.item_code ILIKE $${paramCount}`);
        params.push(`%${itemCode}%`);
        paramCount++;
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const result = await query<any>(
        `SELECT
          vap.item_code, vap.casting_code, vap.customer_code, vap.vendor_id, vap.type,
          vap.final_price, vap.valid_from, vap.valid_through
         FROM v_approved_audit_prices vap
         ${whereClause}
         ORDER BY vap.item_code, vap.customer_code, vap.vendor_id`,
        params
      );

      approvedItems = result || [];
    }

    logger.info(`[PUSH TO SAP] Found ${approvedItems?.length || 0} approved items to push`);

    if (!approvedItems || approvedItems.length === 0) {
      logger.warn('[PUSH TO SAP] No approved items found matching filters');
      return sendError(res, 'No approved items found matching filters', 404);
    }

    // Build a map of existence data for quick lookup
    const existenceMap = new Map<string, any>();
    sapExistenceData.forEach((data: any) => {
      // Vendor key
      if (data.vendorCode) {
        const vendorKey = `${data.itemCode}|${data.vendorCode}`;
        existenceMap.set(vendorKey, {
          action: data.vendorAction || 'POST',
          exists: data.existsInSapVendor || false,
          dataMatches: data.vendorDataMatches || false
        });
      }
      // Customer key
      if (data.customerName) {
        const customerKey = `${data.itemCode}|${data.customerName}`;
        existenceMap.set(customerKey, {
          action: data.customerAction || 'POST',
          exists: data.existsInSapCustomer || false,
          dataMatches: data.customerDataMatches || false
        });
      }
    });

    // Prepare updates for vendor and customer rows
    const vendorUpdates: VendorPriceUpdate[] = [];
    const customerUpdates: CustomerPriceUpdate[] = [];

    for (const item of approvedItems) {
      const validFrom = item.valid_from || new Date().toISOString().split('T')[0];
      const validTo = item.valid_through || '2099-12-31';

      // Customer pricing: ItemCode + CustomerCode → FinalPrice
      if (item.type === 'customer' && item.customer_code) {
        const key = `${item.item_code}|${item.customer_code}`;
        // Only process if this item is in sapExistenceData (user selected it)
        if (!existenceMap.has(key)) continue;

        const existenceData = existenceMap.get(key);
        // Skip if action is SKIP (shouldn't happen as frontend filters these, but be safe)
        if (existenceData.action === 'SKIP') {
          logger.info(`[PUSH TO SAP] SKIP: ${item.item_code} / ${item.customer_code} (exact match)`);
          continue;
        }

        customerUpdates.push({
          itemCode: item.item_code.trim(),
          customerCode: item.customer_code.trim(),
          finalPrice: Number(item.final_price),
          validFrom,
          validTo,
          // needsPatch: true = POST (create), false = PATCH (update)
          needsPatch: existenceData.action === 'POST'
        });

        logger.info(`[PUSH TO SAP] QUEUE: Customer ${item.item_code} / ${item.customer_code} (action=${existenceData.action})`);
      }

      // Vendor pricing: ItemCode + VendorId → CastingPrice (final_price for vendors)
      if (item.type === 'vendor' && item.vendor_id) {
        const key = `${item.item_code}|${item.vendor_id}`;
        // Only process if this item is in sapExistenceData (user selected it)
        if (!existenceMap.has(key)) continue;

        const existenceData = existenceMap.get(key);
        // Skip if action is SKIP (shouldn't happen as frontend filters these, but be safe)
        if (existenceData.action === 'SKIP') {
          logger.info(`[PUSH TO SAP] SKIP: ${item.item_code} / ${item.vendor_id} (exact match)`);
          continue;
        }

        vendorUpdates.push({
          itemCode: item.item_code.trim(),
          vendorCode: item.vendor_id.trim(),
          castingPrice: Number(item.final_price),
          validFrom,
          validTo,
          // needsPatch: true = POST (create), false = PATCH (update)
          needsPatch: existenceData.action === 'POST'
        });

        logger.info(`[PUSH TO SAP] QUEUE: Vendor ${item.item_code} / ${item.vendor_id} (action=${existenceData.action})`);
      }
    }

    logger.info(`[PUSH TO SAP] Prepared: ${vendorUpdates.length} vendor + ${customerUpdates.length} customer updates`);

    // If nothing to sync, return success
    if (vendorUpdates.length === 0 && customerUpdates.length === 0) {
      logger.info(`[PUSH TO SAP] ✓ All items already exist in SAP with matching data - nothing to sync`);
      return sendSuccess(res, {
        itemsProcessed: approvedItems.length,
        vendorRecords: 0,
        customerRecords: 0,
        vendorResults: [],
        customerResults: [],
        summary: {
          total: 0,
          succeeded: 0,
          failed: 0,
          skipped: approvedItems.length
        }
      }, 200, `All items already exist in SAP with matching data`);
    }

    logger.info(`[PUSH TO SAP] Executing batch sync to SAP...`);

    // Execute batch sync
    const results = await sapClient.syncBatch(vendorUpdates, customerUpdates);

    // Log each push to sap_sync_tracking table
    for (let i = 0; i < results.vendor.length; i++) {
      const update = vendorUpdates[i];
      const result = results.vendor[i];
      const approvedItem = approvedItems.find(a => a.item_code === update.itemCode && a.vendor_id === update.vendorCode);

      await logSapPush(
        update.itemCode,
        update.vendorCode,
        'vendor',
        existenceMap.get(`${update.itemCode}|${update.vendorCode}`)?.action || 'POST',
        result.success ? 'success' : 'failure',
        approvedItem?.vendor_id,
        undefined,
        result.error || undefined,
        result.sapResponse
      );
    }

    for (let i = 0; i < results.customer.length; i++) {
      const update = customerUpdates[i];
      const result = results.customer[i];
      const approvedItem = approvedItems.find(a => a.item_code === update.itemCode && a.customer_code === update.customerCode);

      await logSapPush(
        update.itemCode,
        update.customerCode,
        'customer',
        existenceMap.get(`${update.itemCode}|${update.customerCode}`)?.action || 'POST',
        result.success ? 'success' : 'failure',
        undefined,
        approvedItem?.customer_code,
        result.error || undefined,
        result.sapResponse
      );
    }

    const successCount = results.vendor.filter(r => r.success).length +
                        results.customer.filter(r => r.success).length;
    const failureCount = results.vendor.filter(r => !r.success).length +
                        results.customer.filter(r => !r.success).length;

    logger.info(`[PUSH TO SAP] ✓ SYNC COMPLETE: ${successCount} succeeded, ${failureCount} failed`);
    if (failureCount > 0) {
      logger.warn(`[PUSH TO SAP] Failed vendor syncs:`, results.vendor.filter(r => !r.success));
      logger.warn(`[PUSH TO SAP] Failed customer syncs:`, results.customer.filter(r => !r.success));
    }

    return sendSuccess(res, {
      itemsProcessed: approvedItems.length,
      vendorRecords: vendorUpdates.length,
      customerRecords: customerUpdates.length,
      vendorResults: results.vendor,
      customerResults: results.customer,
      summary: {
        total: vendorUpdates.length + customerUpdates.length,
        succeeded: successCount,
        failed: failureCount
      }
    }, 200, `Sync complete: ${successCount} succeeded, ${failureCount} failed out of ${vendorUpdates.length + customerUpdates.length}`);

  } catch (err: any) {
    logger.error('[PUSH TO SAP] Error during sync:', err.message);
    sendError(res, 'Failed to sync approved items to SAP', 500);
  }
}

/**
 * Check which items exist in SAP
 *
 * POST /api/sap/sync/check-existence
 * Body: { items: [{ itemCode, vendorCode?, customerName?, castingPrice?, finalPrice?, validFrom?, validTo? }, ...] }
 */
export async function checkExistenceInSap(req: Request, res: Response) {
  try {
    const { items } = req.body;

    console.log('[SAP CHECK] >>>>>> ENTERING checkExistenceInSap function <<<<<<');
    logger.info(`[SAP CHECK] Starting SAP existence check for ${items?.length || 0} items`);

    if (!Array.isArray(items) || items.length === 0) {
      logger.warn('[SAP CHECK] No items provided');
      return sendError(res, 'Items array required', 400);
    }

    const sapClient = getSapClient();
    if (!sapClient) {
      logger.error('[SAP CHECK] SAP client not configured');
      return sendError(res, 'SAP sync not configured', 503);
    }

    const results: any[] = [];

    for (const item of items) {
      logger.info(`\n[SAP CHECK] ════════════════════════════════════════`);
      logger.info(`[SAP CHECK] Item Code: ${item.itemCode}`);

      const existsVendor = item.vendorCode
        ? await (async () => {
            logger.info(`[SAP CHECK] Vendor Code: ${item.vendorCode}`);
            logger.info(`[SAP CHECK] API Call: GET /SpecialPrices(CardCode='${item.vendorCode}',ItemCode='${item.itemCode}')`);
            logger.debug(`[SAP CHECK] Values: Price=${item.castingPrice}, From=${item.validFrom}, To=${item.validTo}`);
            const result = await sapClient.checkVendorPriceExists({
              itemCode: item.itemCode,
              vendorCode: item.vendorCode,
              castingPrice: item.castingPrice || 0,
              validFrom: item.validFrom || '',
              validTo: item.validTo || ''
            });
            logger.info(`[SAP CHECK] Response: Action=${result.action}, Exists=${result.exists}, DataMatches=${result.dataMatches}, Error=${result.error || 'none'}`);
            return result;
          })()
        : null;

      const existsCustomer = item.customerName
        ? await (async () => {
            logger.info(`[SAP CHECK] Customer Code: ${item.customerName}`);
            logger.info(`[SAP CHECK] API Call: GET /SpecialPrices(CardCode='${item.customerName}',ItemCode='${item.itemCode}')`);
            logger.debug(`[SAP CHECK] Values: Price=${item.finalPrice}, From=${item.validFrom}, To=${item.validTo}`);
            const result = await sapClient.checkCustomerPriceExists({
              itemCode: item.itemCode,
              customerCode: item.customerName,
              finalPrice: item.finalPrice || 0,
              validFrom: item.validFrom || '',
              validTo: item.validTo || ''
            });
            logger.info(`[SAP CHECK] Response: Action=${result.action}, Exists=${result.exists}, DataMatches=${result.dataMatches}, Error=${result.error || 'none'}`);
            return result;
          })()
        : null;

      results.push({
        itemCode: item.itemCode,
        vendorCode: item.vendorCode,
        customerName: item.customerName,

        // Vendor status
        vendorAction: existsVendor?.action || 'POST',
        existsInSapVendor: existsVendor?.exists || false,
        vendorDataMatches: existsVendor?.dataMatches || false,
        vendorSapPrice: existsVendor?.sapPrice,
        vendorLocalPrice: item.castingPrice,
        vendorRecord: existsVendor?.record,
        vendorError: existsVendor?.error,

        // Customer status
        customerAction: existsCustomer?.action || 'POST',
        existsInSapCustomer: existsCustomer?.exists || false,
        customerDataMatches: existsCustomer?.dataMatches || false,
        customerSapPrice: existsCustomer?.sapPrice,
        customerLocalPrice: item.finalPrice,
        customerRecord: existsCustomer?.record,
        customerError: existsCustomer?.error
      });
    }

    logger.info(`[SAP CHECK] Completed SAP existence check - ${results.length} items processed`);
    return sendSuccess(res, results, 200, 'Checked existence in SAP');
  } catch (err) {
    logger.error('[SAP CHECK] Error checking SAP existence:', err);
    sendError(res, 'Failed to check SAP existence', 500);
  }
}

/**
 * Get sync status for items
 *
 * GET /api/sap/sync/status?itemCode=...&limit=50
 */
export async function getSyncStatus(req: Request, res: Response) {
  try {
    const { itemCode, limit = 50 } = req.query;

    let sql = `SELECT * FROM sap_sync_tracking ORDER BY updated_at DESC LIMIT $1`;
    const params: any[] = [limit];

    if (itemCode) {
      sql = `SELECT * FROM sap_sync_tracking WHERE item_code = $1 ORDER BY updated_at DESC LIMIT $2`;
      params.unshift(itemCode);
    }

    const history = await query<any>(sql, params);

    return sendSuccess(res, history, 200, 'SAP sync status retrieved');
  } catch (err) {
    logger.error('getSyncStatus error:', err);
    sendError(res, 'Failed to fetch sync status', 500);
  }
}

/**
 * Get latest push date for an item
 *
 * GET /api/sap/sync/latest-push?itemCode=...&cardCode=...&type=customer|vendor
 */
export async function getLatestPushDate(req: Request, res: Response) {
  try {
    const { itemCode, cardCode, type } = req.query;

    if (!itemCode || !cardCode || !type) {
      return sendError(res, 'Missing required parameters: itemCode, cardCode, type', 400);
    }

    const rows = await query<any>(
      `SELECT pushed_at FROM sap_sync_tracking
       WHERE item_code = $1 AND cardcode = $2 AND type = $3 AND sync_status = 'success'
       ORDER BY pushed_at DESC LIMIT 1`,
      [itemCode, cardCode, type]
    );

    const pushedAt = rows[0]?.pushed_at || null;
    return sendSuccess(res, { itemCode, cardCode, type, pushedAt }, 200);
  } catch (err) {
    logger.error('getLatestPushDate error:', err);
    sendError(res, 'Failed to fetch push date', 500);
  }
}

/**
 * Log SAP sync attempt to audit table (disabled - table schema mismatch)
 */
// async function logSapSync(
//   priceType: 'vendor' | 'customer',
//   itemCode: string,
//   partnerCode: string,
//   price: number,
//   validFrom: string,
//   validTo: string,
//   success: boolean,
//   errorMsg?: string
// ) {
//   try {
//     await query(
//       `INSERT INTO sap_sync_log
//        (price_type, item_code, partner_code, price, valid_from, valid_through, success, error_message)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
//       [priceType, itemCode, partnerCode, price, validFrom, validTo, success, errorMsg || null]
//     );
//   } catch (err) {
//     logger.error('Failed to log SAP sync:', err);
//   }
// }
