import { NextFunction,Request,Response } from 'express';
import { HTTP_STATUS } from '../constants';
import { logger } from './logger';
import { sendError } from './response';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error(err.message, { stack: err.stack });
  const errorMessage = err.message || 'Internal server error';
  sendError(res, errorMessage, HTTP_STATUS.INTERNAL_ERROR,
    process.env['NODE_ENV'] !== 'production' ? err.stack : undefined);
}

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, 'Route not found', HTTP_STATUS.NOT_FOUND);
}
