import { NextFunction,Request,Response } from 'express';
import { HTTP_STATUS } from '../constants';
import { sendError,sendSuccess } from '../middleware/response';
import { getOrSetCache } from '../services/cacheService';
import * as itemService from '../services/itemService';
import { ListItemsQuery } from '../types';

/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: Retrieve a list of items
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of items
 *       401:
 *         description: Unauthorized
 */
export async function listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = req.query as ListItemsQuery;
    console.log('listItems incoming query:', req.query);
    const result = await itemService.listItems(filters);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function listPricingItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = req.query as ListItemsQuery;
    console.log('listPricingItems incoming query:', req.query);
    const result = await itemService.listPricingItems(filters);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function getItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] ?? '';
    const customerCode = req.query.customerCode as string | undefined;
    const groupName = req.query.groupName as string | undefined;
    const date = req.query.date as string | undefined;
    // Fetch item by id with optional customer-specific and tab-specific pricing parameters (as of date)
    const item = await itemService.getItemById(id, customerCode, groupName, date);
    if (!item) { sendError(res, 'Item not found', HTTP_STATUS.NOT_FOUND); return; }
    sendSuccess(res, item);
  } catch (err) { next(err); }
}

export async function getItemBom(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] ?? '';
    const result = await itemService.getBomAndRoute(id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function getFilterOptions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const grade = req.query.grade as string | undefined;
    const vendorId = req.query.vendorId as string | undefined;
    const customerName = req.query.customerName as string | undefined;
    const itemCode = req.query.itemCode as string | undefined;
    const cacheKey = `filter-options-${grade || 'all'}-${vendorId || 'all'}-${customerName || 'all'}-${itemCode || 'all'}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const [grades, customers, vendors, customerTypes, castingCodes, itemGroups, stages, itemCodes, descriptions, customerApprovalFoundries, customerFoundryMappings, foreignNames] = await Promise.all([
        itemService.getDistinctGrades({ vendorId, customerName }),
        itemService.getDistinctCustomers({ vendorId, grade, itemCode }),
        itemService.getVendorsForFilter({ grade, customerName, itemCode }),
        itemService.getDistinctCustomerTypes(),
        itemService.getDistinctCastingCodes({ vendorId }),
        itemService.getDistinctItemGroups(),
        itemService.getDistinctStages(),
        itemService.getDistinctItemCodes({ vendorId, customerName, grade }),
        itemService.getDistinctDescriptions({ vendorId }),
        itemService.getDistinctFoundries(),
        itemService.getCustomerFoundryMappings(),
        itemService.getDistinctForeignNames({ vendorId }),
      ]);
      return { 
        grades, 
        customers, 
        customerTypes, 
        vendors: vendors.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })), 
        castingCodes, 
        itemGroups,
        stages,
        itemCodes,
        descriptions,
        customerApprovalFoundries,
        customerFoundryMappings,
        foreignNames
      };
    });

    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function createItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updatedBy = (req as any).user?.username || 'System';
    const item = await itemService.createItem(req.body, updatedBy);
    sendSuccess(res, item, HTTP_STATUS.CREATED);
  } catch (err) { next(err); }
}

function cleanImportRows(rows: any[]): any[] {
  const skipKeys = new Set(['itemcode', 'item no', 'customercode', 'customer code', 'foundry 1', 'foundry 2', 'foundry 3']);
  return rows.map(row => {
    const cleaned: any = {};
    for (const key of Object.keys(row)) {
      let val = row[key];
      if (typeof val === 'string' && !skipKeys.has(key.toLowerCase())) {
        // Strip out rupee symbol, whitespace, and commas
        const cleanedStr = val.replace(/[₹\s,]/g, '');
        if (cleanedStr !== '' && !isNaN(Number(cleanedStr))) {
          val = Number(cleanedStr);
        }
      }
      cleaned[key] = val;
    }
    return cleaned;
  });
}

export async function importPricing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRows = req.body.rows || [];
    const rows = cleanImportRows(rawRows);
    const importType = req.body.importType || (req.body.isDomestic ? 'Domestic' : 'Export');
    const importContext = req.body.importContext || 'Global';
    const updatedBy = (req as any).user?.username || 'System';
    console.log(`Received ${rows.length} rows to import (importType: ${importType}, context: ${importContext}).`);
    
    if (importType === 'Domestic') {
      const result = await itemService.importDomesticPricingPld(rows, updatedBy, importContext);
      if (result.errors && result.errors.length > 0) {
        sendSuccess(res, { success: false, count: result.count, errors: result.errors });
      } else {
        sendSuccess(res, { success: true, count: result.count });
      }
    } else if (importType === 'Export') {
      const result = await itemService.importDomesticPricing(rows, updatedBy, importContext);
      if (result.errors && result.errors.length > 0) {
        sendSuccess(res, { success: false, count: result.count, errors: result.errors });
      } else {
        sendSuccess(res, { success: true, count: result.count });
      }
    } else if (importType === 'Labour / Job Work') {
      const result = await itemService.importLabourPricing(rows, updatedBy, importContext);
      if (result.errors && result.errors.length > 0) {
        sendSuccess(res, { success: false, count: result.count, errors: result.errors });
      } else {
        sendSuccess(res, { success: true, count: result.count });
      }
    } else if (importType === 'Pin & Bush' || importType === 'Pin & Push') {
      const result = await itemService.importPinPricing(rows, updatedBy, importContext);
      if (result.errors && result.errors.length > 0) {
        sendSuccess(res, { success: false, count: result.count, errors: result.errors });
      } else {
        sendSuccess(res, { success: true, count: result.count });
      }
    } else {
      console.log(`[Import Mock] Received ${rows.length} rows to import.`);
      sendSuccess(res, { success: true, count: rows.length });
    }
  } catch (err) { next(err); }
}

export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] ?? '';
    const updatedBy = (req as any).user?.username || 'System';
    const updated = await itemService.updateItem(id, req.body, updatedBy);
    sendSuccess(res, updated);
  } catch (err) { next(err); }
}

export async function getItemHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itemCode = req.params['itemCode'] ?? '';
    const history = await itemService.getItemHistory(itemCode);
    sendSuccess(res, history);
  } catch (err) { next(err); }
}

export async function mapItemToVendors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] ?? '';
    const { vendorIds } = req.body;
    const updatedBy = (req as any).user?.username || 'System';
    if (!vendorIds || !Array.isArray(vendorIds)) {
      sendError(res, 'vendorIds array is required', HTTP_STATUS.BAD_REQUEST);
      return;
    }
    const result = await itemService.mapItemToVendors(id, vendorIds, updatedBy);
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err?.message || 'Mapping failed', HTTP_STATUS.BAD_REQUEST);
  }
}
