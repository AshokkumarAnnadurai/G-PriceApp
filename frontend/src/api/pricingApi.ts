import { CreateBatchBody,ItemApproval,ItemPriceHistory,PriceLogFiltersResponse,PricingBatch,PricingBatchItem } from '../types';
import { apiClient } from './client';

const filterCache: Record<string, { timestamp: number; data: PriceLogFiltersResponse }> = {};
const FILTER_CACHE_TTL_MS = 60000; // 60 seconds

export const pricingApi = {
  listBatches: async (): Promise<PricingBatch[]> => {
    const res = await apiClient.get<PricingBatch[]>('/pricing/batches');
    return res.data;
  },

  getBatch: async (id: number): Promise<PricingBatch> => {
    const res = await apiClient.get<PricingBatch>(`/pricing/batches/${id}`);
    return res.data;
  },

  getBatchItems: async (id: number): Promise<PricingBatchItem[]> => {
    const res = await apiClient.get<PricingBatchItem[]>(`/pricing/batches/${id}/items`);
    return res.data;
  },

  createBatch: async (body: CreateBatchBody): Promise<PricingBatch> => {
    const res = await apiClient.post<PricingBatch>('/pricing/batches', body);
    return res.data;
  },

  approveBatch: async (id: number): Promise<PricingBatch> => {
    const res = await apiClient.post<PricingBatch>(`/pricing/batches/${id}/approve`);
    return res.data;
  },

  revertBatch: async (id: number, itemIds?: number[]): Promise<PricingBatch> => {
    const res = await apiClient.post<PricingBatch>(`/pricing/batches/${id}/revert`, { itemIds });
    return res.data;
  },

  rejectBatch: async (id: number, reason: string): Promise<PricingBatch> => {
    const res = await apiClient.patch<PricingBatch>(`/pricing/batches/${id}/reject`, { reason });
    return res.data;
  },

  submitBatch: async (id: number): Promise<PricingBatch> => {
    const res = await apiClient.patch<PricingBatch>(`/pricing/batches/${id}/submit`);
    return res.data;
  },

  deleteBatch: async (id: number): Promise<void> => {
    await apiClient.delete(`/pricing/batches/${id}`);
  },


  getPriceLogFilters: async (mode?: 'vendor' | 'customer'): Promise<PriceLogFiltersResponse> => {
    const cacheKey = mode || 'default';
    const now = Date.now();
    if (filterCache[cacheKey] && (now - filterCache[cacheKey].timestamp < FILTER_CACHE_TTL_MS)) {
      return filterCache[cacheKey].data;
    }
    const params = mode ? `?mode=${mode}` : '';
    const res = await apiClient.get<PriceLogFiltersResponse>(`/pricing/log/filters${params}`);
    filterCache[cacheKey] = { timestamp: now, data: res.data };
    return res.data;
  },

  getPriceLog: async (castingCode?: string, itemCode?: string, vendorId?: string, mode?: 'vendor' | 'customer', customerCode?: string): Promise<ItemPriceHistory[]> => {
    const params = new URLSearchParams();
    if (castingCode) params.append('castingCode', castingCode);
    if (mode) params.append('mode', mode);
    if (mode === 'customer') {
      if (customerCode) params.append('customerCode', customerCode);
    } else {
      if (itemCode) params.append('itemCode', itemCode);
      if (vendorId) params.append('vendorId', vendorId);
    }
    const res = await apiClient.get<ItemPriceHistory[]>(`/pricing/log?${params.toString()}`);
    return res.data;
  },

  listItemApprovals: async (): Promise<ItemApproval[]> => {
    const res = await apiClient.get<ItemApproval[]>('/pricing/item-approvals');
    return res.data;
  },

  approveItems: async (itemIds: number[]): Promise<void> => {
    await apiClient.post('/pricing/item-approvals/approve', { itemIds });
  },

  holdItems: async (itemIds: number[]): Promise<void> => {
    await apiClient.post('/pricing/item-approvals/hold', { itemIds });
  },

  raiseDispute: async (itemIds: number[]): Promise<void> => {
    await apiClient.post('/pricing/item-approvals/dispute', { itemIds });
  },
  raiseDisputeFromMaster: async (payload: {
    itemCode: string;
    customerCode?: string;
    customerName: string;
    castingCode?: string;
    approvalDate?: string;
    vendorId?: string;
    newPrice?: number;
    customerTotalPrice?: number;
    disputedField?: string;
    disputes?: Array<{ disputedField: string; newPrice: number; customerTotalPrice: number }>;
    fromDate?: string;
    toDate?: string;
  }): Promise<void> => {
    await apiClient.post('/pricing/disputes/raise-from-master', payload);
  },

  approveItemFromMaster: async (payload: {
    itemCode: string;
    customerCode?: string;
    customerName: string;
    castingCode?: string;
    approvalDate?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<void> => {
    await apiClient.post('/pricing/items/approve-from-master', payload);
  },
  reviseDispute: async (
    id: string | number, 
    cRate: number, 
    vRate: number, 
    cWeight?: number, 
    vWeight?: number,
    rejectionCost?: number,
    powderCoating?: number,
    specialProcess?: number,
    process?: number,
    transCharges?: number,
    ohp?: number,
    packing?: number,
    itemCode?: string,
    castingCode?: string,
    customerCode?: string,
    customerName?: string,
    vendorId?: string,
    vendorName?: string
  ): Promise<{ success: boolean }> => {
    const res = await apiClient.post(`/pricing/disputes/${encodeURIComponent(String(id))}/revise`, { 
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
      vendorName
    });
    return res.data;
  },
  getDisputes: async (): Promise<any[]> => {
    const res = await apiClient.get('/pricing/disputes');
    return res.data;
  },

  updateBatchItem: async (id: number, data: Record<string, number>): Promise<void> => {
    await apiClient.put(`/pricing/batches/items/${id}`, data);
  },

  getPoPriceAudit: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/pricing/audit/po');
    return res.data;
  },

  verifyPoLine: async (docEntry: string, lineNum: string, orderType: string): Promise<void> => {
    await apiClient.post(`/pricing/audit/po/${docEntry}/${lineNum}/verify`, { orderType });
  },

  getSoPriceAudit: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/pricing/audit/so');
    return res.data;
  },

  getPricingComparisonFilters: async (): Promise<{ customers: string[]; vendors: string[] }> => {
    const res = await apiClient.get<{ customers: string[]; vendors: string[] }>('/pricing/comparison/filters');
    return res.data;
  },

  getPricingComparison: async (
    mode: 'customer' | 'vendor',
    partyName: string,
    fromDate: string,
    toDate: string
  ): Promise<any[]> => {
    const params = new URLSearchParams({ mode, partyName, fromDate, toDate });
    const res = await apiClient.get<any[]>(`/pricing/comparison?${params.toString()}`);
    return res.data;
  },

  pushApprovedItemsToSap: async (filters?: {
    customerName?: string;
    vendorId?: string;
    itemCode?: string;
    searchQuery?: string;
    date?: string;
    sapExistenceData?: any[];
    vendorsData?: any[];
  }): Promise<any> => {
    const res = await apiClient.post('/pricing/sap/push-approved', filters || {});
    return res.data.data;
  },

  checkExistenceInSap: async (items: Array<{
    itemCode: string;
    vendorCode?: string;
    customerName?: string;
  }>): Promise<any> => {
    const res = await apiClient.post('/sap/sync/check-existence', { items });
    return res.data;
  },

  getSyncStatus: async (itemCode?: string): Promise<any> => {
    const params = itemCode ? `?itemCode=${itemCode}` : '';
    const res = await apiClient.get(`/sap/sync/status${params}`);
    return res.data;
  },

  getPricingAudit: async (filters?: any): Promise<any[]> => {
    const params = new URLSearchParams();
    if (filters?.itemCode) params.append('itemCode', filters.itemCode);
    if (filters?.customerCode) params.append('customerCode', filters.customerCode);
    if (filters?.vendorId) params.append('vendorId', filters.vendorId);
    if (filters?.type) params.append('type', filters.type);
    const res = await apiClient.get<any[]>(`/pricing/audit/items?${params.toString()}`);
    return res.data;
  },

  getApprovedAudit: async (filters?: any): Promise<any[]> => {
    const params = new URLSearchParams();
    if (filters?.itemCode) params.append('itemCode', filters.itemCode);
    if (filters?.customerCode) params.append('customerCode', filters.customerCode);
    if (filters?.vendorId) params.append('vendorId', filters.vendorId);
    if (filters?.type) params.append('type', filters.type);
    const res = await apiClient.get<any[]>(`/pricing/audit/approved-items?${params.toString()}`);
    return res.data;
  },

  approvePricingItem: async (itemCode: string, customerCode: string, type: 'customer' | 'vendor'): Promise<any> => {
    const res = await apiClient.post('/pricing/audit/items/approve', {
      itemCode,
      customerCode,
      type,
    });
    return res.data;
  },

  getItemPricingDetails: async (itemCode: string, customerCode: string, tab?: string, vendorIds?: string[]): Promise<any> => {
    const params = new URLSearchParams({
      itemCode,
      customerCode,
      tab: tab || 'pending',
    });
    if (vendorIds && vendorIds.length > 0) {
      vendorIds.forEach(id => params.append('vendorIds', id));
    }
    const res = await apiClient.get(`/pricing/audit/items/details?${params.toString()}`);
    return res.data;
  },

  getLatestPushDate: async (itemCode: string, cardCode: string, type: 'customer' | 'vendor'): Promise<any> => {
    const params = new URLSearchParams({
      itemCode,
      cardCode,
      type,
    });
    const res = await apiClient.get(`/sap/sync/latest-push?${params.toString()}`);
    return res.data;
  },

};
