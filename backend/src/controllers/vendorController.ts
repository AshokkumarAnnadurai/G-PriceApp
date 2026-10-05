import { NextFunction,Request,Response } from 'express';
import { HTTP_STATUS } from '../constants';
import { sendError,sendSuccess } from '../middleware/response';
import * as vendorService from '../services/vendorService';
import { CreateMaterialBody,UpdateMaterialBody } from '../types';

/**
 * @swagger
 * /api/vendors:
 *   get:
 *     summary: Retrieve a list of vendors
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of vendors with their materials
 *       401:
 *         description: Unauthorized
 */
export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pageVal = req.query['page'] ? parseInt(req.query['page'] as string, 10) : undefined;
    const pageSizeVal = req.query['pageSize'] ? parseInt(req.query['pageSize'] as string, 10) : undefined;
    const searchVal = req.query['search'] as string || undefined;
    const nameVal = req.query['name'] as string || undefined;
    const bpCodeVal = req.query['bpCode'] as string || undefined;
    const groupNameVal = req.query['groupName'] as string || undefined;

    const vendors = await vendorService.getAllVendors(pageVal, pageSizeVal, searchVal, nameVal, bpCodeVal, groupNameVal);
    sendSuccess(res, vendors);
  } catch (err) { next(err); }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] ?? '';
    const date = req.query.date as string | undefined;
    const vendor = await vendorService.getVendorById(id, date);
    if (!vendor) { sendError(res, 'Vendor not found', HTTP_STATUS.NOT_FOUND); return; }
    sendSuccess(res, vendor);
  } catch (err) { next(err); }
}

export async function addMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const vendorId = req.params['id'] ?? '';
    const body = req.body as CreateMaterialBody;
    const material = await vendorService.addVendorMaterial(vendorId, body);
    if (!material) { sendError(res, 'Failed to add vendor material', HTTP_STATUS.BAD_REQUEST); return; }
    sendSuccess(res, material);
  } catch (err) { next(err); }
}

export async function updateMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const vendorId = req.params['id'] ?? '';
    const materialId = parseInt(req.params['materialId'] ?? '', 10);
    const body = req.body as UpdateMaterialBody;
    const material = await vendorService.updateVendorMaterial(vendorId, materialId, body);
    if (!material) { sendError(res, 'Vendor material not found', HTTP_STATUS.NOT_FOUND); return; }
    sendSuccess(res, material);
  } catch (err) { next(err); }
}

export async function syncMaterials(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await vendorService.syncVendorMaterialsFromSAP();
    sendSuccess(res, result, 200, `Synced ${result.created} new material mappings (${result.total} total items found in SAP)`);
  } catch (err) { next(err); }
}

export async function getHistory(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const history = await vendorService.getVendorMaterialsHistory();
    sendSuccess(res, history);
  } catch (err) { next(err); }
}

export async function deleteMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const vendorId = req.params['id'] ?? '';
    const materialId = parseInt(req.params['materialId'] ?? '', 10);
    await vendorService.deleteVendorMaterial(vendorId, materialId);
    sendSuccess(res, { success: true });
  } catch (err) { next(err); }
}
