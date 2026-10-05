import { Response } from 'express';
import { HTTP_STATUS } from '../constants';
import { ApiError,ApiResponse } from '../types';

export function sendSuccess<T>(res: Response, data: T, status: number = HTTP_STATUS.OK, message?: string): void {
  const body: ApiResponse<T> = { success: true, data, message };
  res.status(status).json(body);
}

export function sendError(res: Response, error: string, status: number = HTTP_STATUS.INTERNAL_ERROR, details?: unknown): void {
  const body: ApiError = { success: false, error, details };
  res.status(status).json(body);
}
