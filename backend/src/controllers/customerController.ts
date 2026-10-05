import { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../constants';
import { logger } from '../middleware/logger';
import { sendError, sendSuccess } from '../middleware/response';
import * as customerService from '../services/customerService';

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: Retrieve a list of unique customers
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of customers
 *       401:
 *         description: Unauthorized
 */
export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pageVal = req.query['page'] ? parseInt(req.query['page'] as string, 10) : undefined;
    const pageSizeVal = req.query['pageSize'] ? parseInt(req.query['pageSize'] as string, 10) : undefined;
    const searchVal = req.query['search'] as string || undefined;
    const nameVal = req.query['name'] as string || undefined;
    const bpCodeVal = req.query['bpCode'] as string || undefined;
    const groupNameVal = req.query['groupName'] as string || undefined;

    const data = await customerService.getAllCustomers(pageVal, pageSizeVal, searchVal, nameVal, bpCodeVal, groupNameVal);
    sendSuccess(res, data);
  } catch (err: any) {
    sendError(res, err?.message || 'Failed to retrieve customers', HTTP_STATUS.BAD_REQUEST);
  }
};

export const getCustomerItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bpCode = req.params.id;
    const groupName = req.query.groupName as string || '';
    const items = await customerService.getCustomerItems(bpCode, groupName);
    logger.info(`[CUSTOMER CONTROLLER] getCustomerItems for ${bpCode} - ${groupName}: found ${items.length} items`);
    sendSuccess(res, { items, total: items.length, page: 1, pageSize: items.length });
  } catch (err: any) {
    sendError(res, err?.message || 'Failed to get customer items', HTTP_STATUS.BAD_REQUEST);
  }
};

export const addCustomerItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bpCode = req.params.id;
    const { itemCode, groupName } = req.body;
    const updatedBy = (req as any).user?.username || 'System';
    const result = await customerService.addCustomerItem(bpCode, itemCode, groupName, updatedBy);
    const { success, ...data } = result;
    sendSuccess(res, data);
  } catch (err: any) {
    sendError(res, err?.message || 'Failed to add customer item', HTTP_STATUS.BAD_REQUEST);
  }
};

export const deleteCustomerItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bpCode = req.params.id;
    const { itemCode, groupName } = req.body;
    const result = await customerService.deleteCustomerItem(bpCode, itemCode, groupName);
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err?.message || 'Failed to delete customer item', HTTP_STATUS.BAD_REQUEST);
  }
};
