import { FilterOptions,ItemListFilters,ItemMaster,PaginatedResponse } from '../types';
import { apiClient } from './client';

export const itemApi = {
  list: async (filters: ItemListFilters = {}): Promise<PaginatedResponse<ItemMaster>> => {
    const params: Record<string, string> = {};
    if (filters.grade) params['grade'] = filters.grade;
    if (filters.vendorId) params['vendorId'] = String(filters.vendorId);
    if (filters.customerName) params['customerName'] = filters.customerName;
    if (filters.customerType) params['customerType'] = filters.customerType;
    if (filters.page) params['page'] = String(filters.page);
    if (filters.pageSize) params['pageSize'] = String(filters.pageSize);
    if (filters.search) params['search'] = filters.search;
    if (filters.itemGroup) params['itemGroup'] = filters.itemGroup;
    if (filters.hasPricing !== undefined) params['hasPricing'] = String(filters.hasPricing);
    if (filters.itemCode) params['itemCode'] = filters.itemCode;
    if (filters.description) params['description'] = filters.description;
    if (filters.castingCode) params['castingCode'] = filters.castingCode;
    if (filters.boughtOutJobWork) params['boughtOutJobWork'] = filters.boughtOutJobWork;
    if (filters.foreignName) params['foreignName'] = filters.foreignName;
    const res = await apiClient.get<PaginatedResponse<ItemMaster>>('/items', { params });
    return res.data;
  },

  listPricing: async (filters: ItemListFilters = {}): Promise<PaginatedResponse<any>> => {
    const params: Record<string, string> = {};
    if (filters.grade) params['grade'] = filters.grade;
    if (filters.vendorId) params['vendorId'] = String(filters.vendorId);
    if (filters.customerName) params['customerName'] = filters.customerName;
    if (filters.customerType) params['customerType'] = filters.customerType;
    if (filters.page) params['page'] = String(filters.page);
    if (filters.pageSize) params['pageSize'] = String(filters.pageSize);
    if (filters.search) params['search'] = filters.search;
    if (filters.itemGroup) params['itemGroup'] = filters.itemGroup;
    if (filters.date) params['date'] = filters.date;
    if (filters.hasPricing !== undefined) params['hasPricing'] = String(filters.hasPricing);
    if ((filters as any).approvalStatus) params['approvalStatus'] = (filters as any).approvalStatus;
    const res = await apiClient.get<PaginatedResponse<any>>('/items/pricing', { params });
    return res.data;
  },

   getOne: async (id: string, customerCode?: string, groupName?: string, date?: string): Promise<ItemMaster> => {
     const params: Record<string, string> = {};
     if (customerCode) params['customerCode'] = customerCode;
     if (groupName) params['groupName'] = groupName;
     if (date) params['date'] = date;
     const res = await apiClient.get<ItemMaster>(`/items/${encodeURIComponent(id)}`, { params });
     return res.data;
   },

  getBom: async (id: string): Promise<{bom: any[], routeFlow: any[]}> => {
    const res = await apiClient.get<{bom: any[], routeFlow: any[]}>(`/items/${encodeURIComponent(id)}/bom`);
    return res.data;
  },


  getFilterOptions: async (filters?: string | { grade?: string; vendorId?: string; customerName?: string; itemCode?: string }): Promise<FilterOptions> => {
    const params: Record<string, string> = {};
    if (typeof filters === 'string') {
      params.grade = filters;
    } else if (filters) {
      if (filters.grade) params.grade = filters.grade;
      if (filters.vendorId) params.vendorId = filters.vendorId;
      if (filters.customerName) params.customerName = filters.customerName;
      if (filters.itemCode) params.itemCode = filters.itemCode;
    }
    const res = await apiClient.get<FilterOptions>('/items/filter-options', { params });
    return res.data;
  },
  create: async (item: Partial<ItemMaster>): Promise<ItemMaster> => {
    const res = await apiClient.post<ItemMaster>('/items', item);
    return res.data;
  },
  importPricing: async (rows: any[], isDomestic?: boolean, importType?: string, importContext?: string): Promise<{ success: boolean; count: number; errors?: string[] }> => {
    const res = await apiClient.post<{ success: boolean; count: number; errors?: string[] }>('/items/import', { rows, isDomestic, importType, importContext });
    return res.data;
  },
  update: async (id: string, item: Partial<ItemMaster>): Promise<ItemMaster> => {
    const res = await apiClient.put<ItemMaster>(`/items/${encodeURIComponent(id)}`, item);
    return res.data;
  },
  mapVendors: async (itemCode: string, vendorIds: string[]): Promise<any> => {
    const res = await apiClient.post<any>(`/items/${encodeURIComponent(itemCode)}/map-vendors`, { vendorIds });
    return res.data;
  },
  getHistory: async (itemCode: string): Promise<any[]> => {
    const res = await apiClient.get<any[]>(`/items/${encodeURIComponent(itemCode)}/history`);
    return res.data;
  },
  getWeightDrawings: async (itemCode: string): Promise<any[]> => {
    const res = await apiClient.get<any[]>(`/items/weight-drawings/${encodeURIComponent(itemCode)}`);
    return res.data;
  },
  saveWeightDrawings: async (itemCode: string, category: string, slots: any[]): Promise<any> => {
    const res = await apiClient.post<any>('/items/weight-drawings', { itemCode, category, slots });
    return res.data;
  },
};
