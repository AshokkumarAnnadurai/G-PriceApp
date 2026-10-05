import { NextFunction,Request,Response } from 'express';
import * as vendorWeightDrawingService from '../services/vendorWeightDrawingService';

export async function getVendorWeightDrawingsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: vendorId, materialId } = req.params;
    const { quarter, year } = req.query;
    if (!vendorId || !materialId) {
      res.status(400).json({ error: 'vendorId and materialId are required' });
      return;
    }
    const result = await vendorWeightDrawingService.getVendorWeightDrawings(
      vendorId, 
      Number(materialId),
      quarter ? String(quarter) : undefined,
      year ? Number(year) : undefined
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function saveVendorWeightDrawingsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: vendorId, materialId } = req.params;
    const { category, slots, quarter, year } = req.body;
    if (!vendorId || !materialId || !category || !Array.isArray(slots)) {
      res.status(400).json({ error: 'vendorId, materialId, category, and slots (array) are required' });
      return;
    }
    await vendorWeightDrawingService.saveVendorWeightDrawings(
      vendorId, 
      Number(materialId), 
      category, 
      slots,
      quarter ? String(quarter) : undefined,
      year ? Number(year) : undefined
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function getMaterialPeriodsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: vendorId, materialId } = req.params;
    if (!vendorId || !materialId) {
      res.status(400).json({ error: 'vendorId and materialId are required' });
      return;
    }
    const result = await vendorWeightDrawingService.getMaterialPeriods(vendorId, Number(materialId));
    res.json(result);
  } catch (err) {
    next(err);
  }
}
