import { NextFunction,Request,Response } from 'express';
import { HTTP_STATUS } from '../constants';
import { sendError,sendSuccess } from '../middleware/response';
import * as pricingService from '../services/pricingService';
import { CreateBatchBody } from '../types';

/**
 * @swagger
 * /api/pricing/batches:
 *   get:
 *     summary: Retrieve a list of pricing batches
 *     tags: [Pricing Batches]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of pricing batches
 *       401:
 *         description: Unauthorized
 */
export async function listBatches(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const batches = await pricingService.listBatches();
    sendSuccess(res, batches);
  } catch (err) { next(err); }
}

export async function getBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) { sendError(res, 'Invalid batch ID', HTTP_STATUS.BAD_REQUEST); return; }
    const batch = await pricingService.getBatchById(id);
    if (!batch) { sendError(res, 'Batch not found', HTTP_STATUS.NOT_FOUND); return; }
    sendSuccess(res, batch);
  } catch (err) { next(err); }
}

export async function getBatchItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) { sendError(res, 'Invalid batch ID', HTTP_STATUS.BAD_REQUEST); return; }
    const items = await pricingService.getBatchItems(id);
    sendSuccess(res, items);
  } catch (err) { next(err); }
}

export async function createBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as CreateBatchBody;
    const batch = await pricingService.createBatch(body);
    sendSuccess(res, batch, HTTP_STATUS.CREATED);
  } catch (err) { next(err); }
}

export async function approveBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) { sendError(res, 'Invalid batch ID', HTTP_STATUS.BAD_REQUEST); return; }
    const batch = await pricingService.approveBatch(id);
    sendSuccess(res, batch, HTTP_STATUS.OK, 'Batch approved successfully');
  } catch (err) { next(err); }
}

export async function rejectBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) { sendError(res, 'Invalid batch ID', HTTP_STATUS.BAD_REQUEST); return; }
    const reason = (req.body as { reason?: string }).reason ?? 'No reason provided';
    const batch = await pricingService.rejectBatch(id, reason);
    sendSuccess(res, batch, HTTP_STATUS.OK, 'Batch rejected');
  } catch (err) { next(err); }
}

export async function submitBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) { sendError(res, 'Invalid batch ID', HTTP_STATUS.BAD_REQUEST); return; }
    const batch = await pricingService.submitBatch(id);
    sendSuccess(res, batch, HTTP_STATUS.OK, 'Batch submitted for approval');
  } catch (err) { next(err); }
}

export async function deleteBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) { sendError(res, 'Invalid batch ID', HTTP_STATUS.BAD_REQUEST); return; }
    await pricingService.deleteBatch(id);
    res.status(204).end();
  } catch (err) { next(err); }
}


export async function getPriceLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const mode = req.query.mode as string;
    const castingCode = req.query.castingCode as string;
    if (mode === 'customer') {
      const customerCode = req.query.customerCode as string;
      const history = await pricingService.getCustomerPriceLog(castingCode, customerCode);
      sendSuccess(res, history);
    } else {
      const itemCode = req.query.itemCode as string;
      const vendorId = req.query.vendorId as string;
      const history = await pricingService.getPriceLog(castingCode, itemCode, vendorId);
      sendSuccess(res, history);
    }
  } catch (err) { next(err); }
}

export async function getPriceLogFilters(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const mode = req.query.mode as string;
    if (mode === 'customer') {
      const filters = await pricingService.getCustomerPriceLogFilters();
      sendSuccess(res, filters);
    } else {
      const filters = await pricingService.getPriceLogFilters();
      sendSuccess(res, filters);
    }
  } catch (err) { next(err); }
}

export async function getItemApprovals(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await pricingService.getItemApprovals();
    sendSuccess(res, items);
  } catch (err) { next(err); }
}

export async function approveItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemIds } = req.body as { itemIds: number[] };
    if (!itemIds || !Array.isArray(itemIds)) {
      sendError(res, 'itemIds must be an array of numbers', HTTP_STATUS.BAD_REQUEST);
      return;
    }
    await pricingService.approveItems(itemIds);
    sendSuccess(res, null, HTTP_STATUS.OK, 'Items approved successfully');
  } catch (err) { next(err); }
}

export async function holdItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemIds } = req.body as { itemIds: number[] };
    if (!itemIds || !Array.isArray(itemIds)) {
      sendError(res, 'itemIds must be an array of numbers', HTTP_STATUS.BAD_REQUEST);
      return;
    }
    await pricingService.holdItems(itemIds);
    sendSuccess(res, null, HTTP_STATUS.OK, 'Items put on hold');
  } catch (err) { next(err); }
}

export async function disputeItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemIds } = req.body as { itemIds: number[] };
    if (!itemIds || !Array.isArray(itemIds)) {
      sendError(res, 'itemIds must be an array of numbers', HTTP_STATUS.BAD_REQUEST);
      return;
    }
    await pricingService.disputeItems(itemIds);
    sendSuccess(res, null, HTTP_STATUS.OK, 'Items disputed');
  } catch (err) { next(err); }
}

export async function raiseDisputeFromMaster(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemCode, customerCode, customerName, castingCode, newPrice, customerTotalPrice, disputedField, disputes, fromDate, toDate } = req.body;
    if (!itemCode || !customerName) {
      sendError(res, 'itemCode and customerName are required', HTTP_STATUS.BAD_REQUEST);
      return;
    }
    
    let disputesList = disputes;
    if (!disputesList || !Array.isArray(disputesList)) {
      disputesList = [{
        disputedField: disputedField || 'Casting Price',
        newPrice: Number(newPrice) || 0,
        customerTotalPrice: Number(customerTotalPrice) || 0
      }];
    }

    await pricingService.raiseDisputeFromMaster(
      itemCode, 
      customerCode || '', 
      customerName, 
      castingCode || '', 
      disputesList,
      fromDate || undefined,
      toDate || undefined
    );
    sendSuccess(res, null, HTTP_STATUS.OK, 'Disputes raised successfully');
  } catch (err) { next(err); }
}

export async function approveItemFromMaster(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemCode, customerCode, customerName, castingCode, fromDate, toDate } = req.body;
    if (!itemCode || !customerName) {
      sendError(res, 'itemCode and customerName are required', HTTP_STATUS.BAD_REQUEST);
      return;
    }
    await pricingService.approveItemFromMaster(
      itemCode,
      customerCode || '',
      customerName,
      castingCode || '',
      fromDate || undefined,
      toDate || undefined
    );
    sendSuccess(res, null, HTTP_STATUS.OK, 'Item approved successfully');
  } catch (err) { next(err); }
}

export async function getDisputes(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const disputes = await pricingService.getDisputes();
    sendSuccess(res, disputes, HTTP_STATUS.OK, 'Disputes retrieved');
  } catch (err) { next(err); }
}

export async function updateBatchItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    const data = req.body;
    const updated = await pricingService.updateBatchItem(id, data);
    sendSuccess(res, updated, HTTP_STATUS.OK, 'Batch item updated');
  } catch (err) { next(err); }
}

export async function getPoPriceAudit(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await pricingService.getPoPriceAudit();
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function verifyPoLine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { docEntry, lineNum } = req.params;
    const orderType = req.body.orderType || 'PO';
    const verifiedBy = (req as any).user?.username || 'Admin';
    await pricingService.verifyPoLine(docEntry || '', lineNum || '', orderType, verifiedBy);
    sendSuccess(res, null, HTTP_STATUS.OK, 'Order line verified');
  } catch (err) { next(err); }
}

export async function getSoPriceAudit(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await pricingService.getSoPriceAudit();
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getPricingComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const mode = (req.query['mode'] as string) || 'customer';
    const partyName = (req.query['partyName'] as string) || '';
    const fromDate = (req.query['fromDate'] as string) || '';
    const toDate = (req.query['toDate'] as string) || '';
    if (!partyName || !fromDate || !toDate) {
      sendError(res, 'partyName, fromDate and toDate are required', HTTP_STATUS.BAD_REQUEST);
      return;
    }
    const data = await pricingService.getPricingComparison(
      mode as 'customer' | 'vendor',
      partyName,
      fromDate,
      toDate
    );
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getPricingComparisonFilters(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await pricingService.getPricingComparisonFilters();
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function revertBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    const { itemIds } = req.body || {};
    const batch = await pricingService.revertBatch(id, Array.isArray(itemIds) ? itemIds : undefined);
    sendSuccess(res, batch, HTTP_STATUS.OK, 'Batch reverted successfully');
  } catch (err) { next(err); }
}

export async function reviseDispute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = String(req.params.id || '').trim();
    let dbId = 0;
    if (/^\d+$/.test(rawId)) {
      const parsed = parseInt(rawId, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 2147483647) {
        dbId = parsed;
      }
    }

    const { 
      cRate, 
      vRate,
      cWeight,
      vWeight,
      rejectionCost,
      powderCoating,
      specialProcess,
      process,
      transCharges,
      ohp,
      packing,
      itemCode,
      castingCode,
      customerCode,
      customerName,
      vendorId,
      vendorName,
      vendorCode
    } = req.body;

    const passedItemCode = itemCode || (rawId.startsWith('DSP-') ? rawId.replace(/^DSP-/, '') : (isNaN(Number(rawId)) ? rawId : ''));

    const result = await pricingService.reviseDispute({
      dbId, 
      cRate, 
      vRate,
      cWeight,
      vWeight,
      rejectionCost,
      powderCoating,
      specialProcess,
      process,
      transCharges,
      ohp,
      packing,
      itemCodeParam: passedItemCode,
      castingCodeParam: castingCode,
      customerCodeParam: customerCode,
      customerNameParam: customerName,
      vendorIdParam: vendorId || vendorCode,
      vendorNameParam: vendorName
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ── Price Audit Endpoints ───────────────────────────────────────────────────────

export async function getPricingAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      itemCode: req.query.itemCode as string,
      customerCode: req.query.customerCode as string,
      vendorId: req.query.vendorId as string,
      type: req.query.type as 'customer' | 'vendor',
    };
    const data = await pricingService.getPricingAuditData(filters);
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getApprovedAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      itemCode: req.query.itemCode as string,
      customerCode: req.query.customerCode as string,
      vendorId: req.query.vendorId as string,
      type: req.query.type as 'customer' | 'vendor',
    };
    const data = await pricingService.getApprovedAuditData(filters);
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function approvePricingItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemCode, customerCode, type } = req.body;
    const approvedBy = (req as any).user?.username || 'System';

    if (!itemCode || !customerCode || !type) {
      sendError(res, 'itemCode, customerCode, and type are required', HTTP_STATUS.BAD_REQUEST);
      return;
    }

    const result = await pricingService.approvePricingItem(itemCode, customerCode, type, approvedBy);
    if (result.success) {
      sendSuccess(res, result, HTTP_STATUS.OK, 'Item approved successfully');
    } else {
      sendError(res, result.message, HTTP_STATUS.BAD_REQUEST);
    }
  } catch (err) { next(err); }
}

export async function getItemPricingDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itemCode = req.query.itemCode as string;
    const customerCode = req.query.customerCode as string;
    const tab = (req.query.tab as string) || 'pending';
    const vendorIds = req.query.vendorIds ? (Array.isArray(req.query.vendorIds) ? req.query.vendorIds as string[] : [req.query.vendorIds as string]) : undefined;

    if (!itemCode || !customerCode) {
      sendError(res, 'itemCode and customerCode are required', HTTP_STATUS.BAD_REQUEST);
      return;
    }

    const details = await pricingService.getItemPricingDetails(itemCode, customerCode, tab, vendorIds);
    sendSuccess(res, details);
  } catch (err) { next(err); }
}

export async function pushApprovedItemsToSap(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.email || 'unknown';
    const result = await pricingService.pushApprovedItemsToSap(userId);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function getSyncStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itemCode = req.query.itemCode as string | undefined;
    const result = await pricingService.getSyncStatus(itemCode);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}
