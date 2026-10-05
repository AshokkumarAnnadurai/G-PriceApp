import { NextFunction,Request,Response } from 'express';
import * as weightDrawingService from '../services/weightDrawingService';

export async function getWeightDrawingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemCode } = req.params;
    if (!itemCode) {
      res.status(400).json({ error: 'itemCode is required' });
      return;
    }
    const result = await weightDrawingService.getWeightDrawings(itemCode);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function saveWeightDrawingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { itemCode, category, slots } = req.body;
    if (!itemCode || !category || !Array.isArray(slots)) {
      res.status(400).json({ error: 'itemCode, category, and slots (array) are required' });
      return;
    }
    await weightDrawingService.saveWeightDrawings(itemCode, category, slots);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
