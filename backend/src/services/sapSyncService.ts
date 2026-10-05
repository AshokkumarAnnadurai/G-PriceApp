import axios, { AxiosInstance } from 'axios';
import { logger } from '../middleware/logger';

interface SapConfig {
  baseUrl: string;
  username: string;
  password: string;
  companyDb: string;
  timeout: number;
}

interface VendorPriceUpdate {
  itemCode: string;
  vendorCode: string;
  castingPrice: number;
  validFrom: string;
  validTo: string;
  existsInSap?: boolean;
  needsPatch?: boolean; // true = needs POST (create), false = needs PATCH (update)
}

interface CustomerPriceUpdate {
  itemCode: string;
  customerCode: string;
  finalPrice: number;
  validFrom: string;
  validTo: string;
  existsInSap?: boolean;
  needsPatch?: boolean; // true = needs POST (create), false = needs PATCH (update)
}

interface SapSyncResult {
  success: boolean;
  message: string;
  sapResponse?: any;
  error?: string;
}

class SapODataClient {
  private client: AxiosInstance;
  private config: SapConfig;
  private sessionCookie: string | null = null;

  constructor(sapConfig: SapConfig) {
    this.config = sapConfig;

    this.client = axios.create({
      baseURL: sapConfig.baseUrl,
      timeout: sapConfig.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });

    this.client.interceptors.response.use(
      (res: any) => {
        logger.debug(`SAP OData response [${res.status}]:`, res.data);
        return res;
      },
      (err: any) => {
        logger.error('SAP OData error:', {
          status: err.response?.status,
          data: err.response?.data,
          message: err.message
        });
        return Promise.reject(err);
      }
    );
  }

  /**
   * Login to SAP B1 OData API
   * Must be called before any other operations
   */
  async login(): Promise<boolean> {
    try {
      const response = await this.client.post('/Login', {
        UserName: this.config.username,
        Password: this.config.password,
        CompanyDB: this.config.companyDb
      });

      const cookieHeader = response.headers['set-cookie']?.[0];
      if (cookieHeader) {
        this.sessionCookie = cookieHeader;
        this.client.defaults.headers.common['Cookie'] = this.sessionCookie;
        logger.debug('Session cookie stored');
      }
      logger.info('SAP B1 login successful');

      return true;
    } catch (error: any) {
      logger.error('SAP B1 login failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Check if vendor price exists in SAP SpecialPrices with EXACT match
   * Returns action: 'POST' (create), 'PATCH' (update), or 'SKIP' (no action needed)
   */
  async checkVendorPriceExists(update: VendorPriceUpdate): Promise<{
    action: 'POST' | 'PATCH' | 'SKIP';
    exists: boolean;
    dataMatches: boolean;
    record?: any;
    error?: string;
    sapPrice?: number;
    sapValidFrom?: string;
    sapValidTo?: string;
  }> {
    try {
      const url = `/SpecialPrices(CardCode='${update.vendorCode.trim()}',ItemCode='${update.itemCode.trim()}')`;
      const response = await this.client.get(url);

      // If API returns 200 with data, the record exists
      if (response.data) {
        const sapPrice = Number(response.data.Price || 0);
        const sapValidFrom = this.formatDate(response.data.ValidFrom);
        const sapValidTo = this.formatDate(response.data.ValidTo);

        // Check if data matches
        const priceMatches = sapPrice === update.castingPrice;
        const validFromMatches = sapValidFrom === update.validFrom;
        const validToMatches = sapValidTo === update.validTo;
        const dataMatches = priceMatches && validFromMatches && validToMatches;

        return {
          action: dataMatches ? 'SKIP' : 'PATCH',
          exists: true,
          dataMatches,
          record: response.data,
          sapPrice,
          sapValidFrom,
          sapValidTo
        };
      }

      return { action: 'POST', exists: false, dataMatches: false };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.warn(`Failed to check vendor price existence: ${errorMsg}`);
      return { action: 'POST', exists: false, dataMatches: false, error: errorMsg };
    }
  }

  /**
   * Check if customer price exists in SAP SpecialPrices
   * Returns action: 'POST' (create), 'PATCH' (update), or 'SKIP' (no action needed)
   */
  async checkCustomerPriceExists(update: CustomerPriceUpdate): Promise<{
    action: 'POST' | 'PATCH' | 'SKIP';
    exists: boolean;
    dataMatches: boolean;
    record?: any;
    error?: string;
    sapPrice?: number;
    sapValidFrom?: string;
    sapValidTo?: string;
  }> {
    try {
      const url = `/SpecialPrices(CardCode='${update.customerCode.trim()}',ItemCode='${update.itemCode.trim()}')`;
      const response = await this.client.get(url);

      // If API returns 200 with data, the record exists
      if (response.data) {
        const sapPrice = Number(response.data.Price || 0);
        const sapValidFrom = this.formatDate(response.data.ValidFrom);
        const sapValidTo = this.formatDate(response.data.ValidTo);

        // Check if data matches
        const priceMatches = Math.abs(sapPrice - update.finalPrice) < 0.001;
        const validFromMatches = sapValidFrom === update.validFrom;
        const validToMatches = sapValidTo === update.validTo;
        const dataMatches = priceMatches && validFromMatches && validToMatches;

        return {
          action: dataMatches ? 'SKIP' : 'PATCH',
          exists: true,
          dataMatches,
          record: response.data,
          sapPrice,
          sapValidFrom,
          sapValidTo
        };
      }

      return { action: 'POST', exists: false, dataMatches: false };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.warn(`Failed to check customer price existence: ${errorMsg}`);
      return { action: 'POST', exists: false, dataMatches: false, error: errorMsg };
    }
  }

  private formatDate(dateStr: string | Date): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Sync vendor price to SAP SpecialPrices
   * Uses needsPatch flag from existence check or performs check if not provided
   */
  async syncVendorPrice(update: VendorPriceUpdate): Promise<SapSyncResult> {
    try {
      // Check if we have needsPost flag from existence check (for backward compatibility)
      if (update.needsPatch !== undefined) {
        if (!update.needsPatch) {
          logger.info(`[VENDOR] PATCH (data mismatch): ${update.itemCode} / ${update.vendorCode}`);
          return this.updateSpecialPrice(update.itemCode, update.vendorCode, update.castingPrice, update.validFrom, update.validTo);
        } else {
          logger.info(`[VENDOR] POST (doesn't exist): ${update.itemCode} / ${update.vendorCode}`);
          return this.createSpecialPrice(update.itemCode, update.vendorCode, update.castingPrice, update.validFrom, update.validTo);
        }
      }

      // Fallback: check existence if not provided
      const checkResult = await this.checkVendorPriceExists(update);

      if (checkResult.action === 'SKIP') {
        logger.info(`[VENDOR] SKIP (exact match): ${update.itemCode} / ${update.vendorCode}`);
        return {
          success: true,
          message: `Vendor price already exists in SAP (exact match) - skipped: ${update.itemCode} / ${update.vendorCode}`,
          sapResponse: checkResult.record
        };
      }

      if (checkResult.action === 'POST') {
        logger.info(`[VENDOR] POST (doesn't exist): ${update.itemCode} / ${update.vendorCode}`);
        return this.createSpecialPrice(update.itemCode, update.vendorCode, update.castingPrice, update.validFrom, update.validTo);
      }

      logger.info(`[VENDOR] PATCH (data mismatch): ${update.itemCode} / ${update.vendorCode}`);
      return this.updateSpecialPrice(update.itemCode, update.vendorCode, update.castingPrice, update.validFrom, update.validTo);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error('Failed to sync vendor price:', errorMsg);
      return {
        success: false,
        message: `Failed to sync vendor price`,
        error: errorMsg
      };
    }
  }

  /**
   * Sync customer price to SAP SpecialPrices
   * Uses needsPatch flag from existence check or performs check if not provided
   */
  async syncCustomerPrice(update: CustomerPriceUpdate): Promise<SapSyncResult> {
    try {
      // Check if we have needsPost flag from existence check (for backward compatibility)
      if (update.needsPatch !== undefined) {
        if (!update.needsPatch) {
          logger.info(`[CUSTOMER] PATCH (data mismatch): ${update.itemCode} / ${update.customerCode}`);
          return this.updateSpecialPrice(update.itemCode, update.customerCode, update.finalPrice, update.validFrom, update.validTo);
        } else {
          logger.info(`[CUSTOMER] POST (doesn't exist): ${update.itemCode} / ${update.customerCode}`);
          return this.createSpecialPrice(update.itemCode, update.customerCode, update.finalPrice, update.validFrom, update.validTo);
        }
      }

      // Fallback: check existence if not provided
      const checkResult = await this.checkCustomerPriceExists(update);

      if (checkResult.action === 'SKIP') {
        logger.info(`[CUSTOMER] SKIP (exact match): ${update.itemCode} / ${update.customerCode}`);
        return {
          success: true,
          message: `Customer price already exists in SAP (exact match) - skipped: ${update.itemCode} / ${update.customerCode}`,
          sapResponse: checkResult.record
        };
      }

      if (checkResult.action === 'POST') {
        logger.info(`[CUSTOMER] POST (doesn't exist): ${update.itemCode} / ${update.customerCode}`);
        return this.createSpecialPrice(update.itemCode, update.customerCode, update.finalPrice, update.validFrom, update.validTo);
      }

      logger.info(`[CUSTOMER] PATCH (data mismatch): ${update.itemCode} / ${update.customerCode}`);
      return this.updateSpecialPrice(update.itemCode, update.customerCode, update.finalPrice, update.validFrom, update.validTo);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error('Failed to sync customer price:', errorMsg);
      return {
        success: false,
        message: `Failed to sync customer price`,
        error: errorMsg
      };
    }
  }

  /**
   * Create new SpecialPrice record
   */
  private async createSpecialPrice(itemCode: string, cardCode: string, price: number, validFrom: string, validTo: string): Promise<SapSyncResult> {
    try {
      const payload = {
        CardCode: cardCode.trim(),
        ItemCode: itemCode.trim(),
        Price: price,
        ValidFrom: validFrom,
        ValidTo: validTo
      };

      logger.info(`[CREATE] POST /SpecialPrices (${itemCode} / ${cardCode})`);
      logger.info(`[CREATE] Dates - From: ${validFrom} → To: ${validTo}`);
      logger.info(`[CREATE] Price: ${price}`);
      logger.debug(`[CREATE] Payload:`, JSON.stringify(payload));
      const response = await this.client.post('/SpecialPrices', payload);

      logger.info(`[CREATE] ✓ SAP Response Status: ${response.status}`);
      logger.debug(`[CREATE] SAP Response Data:`, JSON.stringify(response.data));

      return {
        success: true,
        message: `SpecialPrice created: ${itemCode} / ${cardCode}`,
        sapResponse: response.data
      };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error('Failed to create SpecialPrice:', errorMsg);
      return {
        success: false,
        message: 'Failed to create SpecialPrice',
        error: errorMsg
      };
    }
  }

  /**
   * Update existing SpecialPrice record
   */
  private async updateSpecialPrice(itemCode: string, cardCode: string, price: number, validFrom: string, validTo: string): Promise<SapSyncResult> {
    try {
      const url = `/SpecialPrices(CardCode='${cardCode.trim()}',ItemCode='${itemCode.trim()}')`;
      // For PATCH, send simplified payload with only the fields to update
      const payload = {
        Price: price,
        ValidFrom: validFrom,
        ValidTo: validTo
      };

      logger.info(`[UPDATE] PATCH /SpecialPrices (${itemCode} / ${cardCode})`);
      logger.info(`[UPDATE] Dates - From: ${validFrom} → To: ${validTo}`);
      logger.info(`[UPDATE] Price: ${price}`);
      logger.debug(`[UPDATE] Payload:`, JSON.stringify(payload));
      const response = await this.client.patch(url, payload);

      logger.info(`[UPDATE] ✓ SAP Response Status: ${response.status}`);
      logger.debug(`[UPDATE] SAP Response Data:`, JSON.stringify(response.data));

      return {
        success: true,
        message: `SpecialPrice updated: ${itemCode} / ${cardCode}`,
        sapResponse: response.data
      };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error('Failed to update SpecialPrice:', errorMsg);
      logger.debug('SAP error response:', error.response?.data);
      return {
        success: false,
        message: 'Failed to update SpecialPrice',
        error: errorMsg
      };
    }
  }

  /**
   * Batch sync multiple prices
   */
  async syncBatch(
    vendorUpdates: VendorPriceUpdate[] = [],
    customerUpdates: CustomerPriceUpdate[] = []
  ): Promise<{ vendor: SapSyncResult[], customer: SapSyncResult[] }> {
    const vendorResults = await Promise.all(
      vendorUpdates.map(u => this.syncVendorPrice(u))
    );

    const customerResults = await Promise.all(
      customerUpdates.map(u => this.syncCustomerPrice(u))
    );

    return { vendor: vendorResults, customer: customerResults };
  }
}

let sapClient: SapODataClient | null = null;

export async function initSapSync() {
  const sapConfig: SapConfig = {
    baseUrl: process.env.SAP_ODATA_URL || 'http://13.205.60.97:50001/b1s/v2',
    username: process.env.SAP_USERNAME || '',
    password: process.env.SAP_PASSWORD || '',
    companyDb: process.env.SAP_COMPANY_DB || '',
    timeout: 30000
  };

  if (!sapConfig.baseUrl || !sapConfig.username || !sapConfig.companyDb) {
    logger.warn('SAP sync not configured - pricing sync will be disabled');
    return null;
  }

  sapClient = new SapODataClient(sapConfig);

  const loginSuccess = await sapClient.login();
  if (!loginSuccess) {
    logger.error('Failed to login to SAP B1');
    sapClient = null;
    return null;
  }

  logger.info('SAP OData client initialized and logged in');
  return sapClient;
}

export function getSapClient(): SapODataClient | null {
  return sapClient;
}

export { CustomerPriceUpdate,SapODataClient,SapSyncResult,VendorPriceUpdate };
