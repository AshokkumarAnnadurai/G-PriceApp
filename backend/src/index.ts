import cors from 'cors';
import express from 'express';
import { config } from './config';
import { errorHandler,notFoundHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import { router } from './routes';
import { initSapSync } from './services/sapSyncService';
import { cleanupOldSapLogTables } from './db/cleanup_sap_logs';

import { setupSwagger } from './swagger';

import path from 'path';

const app = express();

app.use(cors({ origin: config.frontendUrls, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

import { appCache } from './services/cacheService';

// Flush in-memory cache on startup
appCache.flushAll();

// Cleanup old SAP log tables
cleanupOldSapLogTables().catch(err => {
  logger.error('Cleanup error:', err);
});

// Initialize SAP OData client (async)
initSapSync().catch(err => {
  logger.error('SAP initialization error:', err);
});

app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Setup Swagger UI Documentation
setupSwagger(app);

app.use('/api', router);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Geekey API running on port ${config.port} [${config.nodeEnv}]`);
});

// trigger restart 2
