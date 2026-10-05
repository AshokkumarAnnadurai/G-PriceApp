import { apiClient } from './client';

export const customerApi = {
  getAll: async (page?: number, pageSize?: number, search?: string, name?: string, bpCode?: string, groupName?: string): Promise<any> => {
    const params = {
      ...(page && pageSize ? { page, pageSize } : {}),
      ...(search ? { search } : {}),
      ...(name ? { name } : {}),
      ...(bpCode ? { bpCode } : {}),
      ...(groupName ? { groupName } : {}),
    };
    const res = await apiClient.get<any>('/customers', { params });
    return res.data;
  },
  getItems: async (bpCode: string, groupName: string): Promise<any> => {
    const res = await apiClient.get<any>(`/customers/${encodeURIComponent(bpCode)}/items`, {
      params: { groupName }
    });
    return res.data;
  },
  addItem: async (bpCode: string, itemCode: string, groupName: string): Promise<any> => {
    const res = await apiClient.post<any>(`/customers/${encodeURIComponent(bpCode)}/items`, {
      itemCode, groupName
    });
    return res.data;
  },
  deleteItem: async (bpCode: string, itemCode: string, groupName: string): Promise<any> => {
    const res = await apiClient.delete<any>(`/customers/${encodeURIComponent(bpCode)}/items`, {
      data: { itemCode, groupName }
    });
    return res.data;
  }
};

