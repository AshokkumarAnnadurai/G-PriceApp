import { CreateMaterialBody,UpdateMaterialBody,Vendor,VendorMaterial } from '../types';
import { apiClient } from './client';

export const vendorApi = {
  getAll: async (page?: number, pageSize?: number, search?: string, name?: string, bpCode?: string, groupName?: string): Promise<any> => {
    const params = {
      ...(page && pageSize ? { page, pageSize } : {}),
      ...(search ? { search } : {}),
      ...(name ? { name } : {}),
      ...(bpCode ? { bpCode } : {}),
      ...(groupName ? { groupName } : {}),
    };
    const res = await apiClient.get<any>('/vendors', { params });
    return res.data;
  },

  getOne: async (id: string, date?: string): Promise<Vendor> => {
    const params: Record<string, string> = {};
    if (date) params['date'] = date;
    const res = await apiClient.get<Vendor>(`/vendors/${id}`, { params });
    return res.data;
  },

  addMaterial: async (vendorId: string, body: CreateMaterialBody): Promise<VendorMaterial> => {
    const res = await apiClient.post<VendorMaterial>(`/vendors/${vendorId}/materials`, body);
    return res.data;
  },

  updateMaterial: async (vendorId: string, materialId: number, body: UpdateMaterialBody): Promise<VendorMaterial> => {
    const res = await apiClient.put<VendorMaterial>(`/vendors/${vendorId}/materials/${materialId}`, body);
    return res.data;
  },

  syncMaterials: async (): Promise<{ created: number; total: number }> => {
    const res = await apiClient.post<{ created: number; total: number }>('/vendors/sync-materials');
    return res.data;
  },

  getHistory: async (): Promise<any[]> => {
    const res = await apiClient.get<any[]>('/vendors/materials/history');
    return res.data;
  },
  deleteMaterial: async (vendorId: string, materialId: number): Promise<any> => {
    const res = await apiClient.delete<any>(`/vendors/${vendorId}/materials/${materialId}`);
    return res.data;
  },

  getWeightDrawings: async (vendorId: string, materialId: number, quarter?: string, year?: number): Promise<any[]> => {
    const params = new URLSearchParams();
    if (quarter) params.append('quarter', quarter);
    if (year) params.append('year', String(year));
    const res = await apiClient.get<any[]>(`/vendors/${vendorId}/materials/${materialId}/weight-drawings?${params.toString()}`);
    return res.data;
  },

  saveWeightDrawings: async (
    vendorId: string,
    materialId: number,
    category: string,
    slots: any[],
    quarter?: string,
    year?: number
  ): Promise<any> => {
    const res = await apiClient.post<any>(`/vendors/${vendorId}/materials/${materialId}/weight-drawings`, {
      category,
      slots,
      quarter,
      year,
    });
    return res.data;
  },

  getMaterialPeriods: async (vendorId: string, materialId: number): Promise<any[]> => {
    const res = await apiClient.get<any[]>(`/vendors/${vendorId}/materials/${materialId}/periods`);
    return res.data;
  },
};
