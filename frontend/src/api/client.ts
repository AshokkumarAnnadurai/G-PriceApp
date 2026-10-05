import axios from 'axios';
import { ApiResponse } from '../types';

// const BASE_URL = 'https://geekeyy-pricingapi.signatech.com/api';
const BASE_URL = 'https://geekeyy-pricingapi-uat.signatech.com/api';
// const BASE_URL = 'http://localhost:4001/api';
export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
});

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('gk_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single place where the wrapper is unwrapped — never do this in components
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>;
    if (body && typeof body === 'object' && 'success' in body) {
      if (!body.success) {
        return Promise.reject(new Error((body as { error?: string }).error ?? 'Request failed'));
      }
      response.data = body.data; // unwrap
    }
    return response;
  },
  (error) => {
    if (error?.response?.status === 401) {
      // Dispatch a global event to show the re-login modal
      window.dispatchEvent(new CustomEvent('session-expired'));
    }

    const msg =
      error?.response?.data?.error ??
      error?.message ??
      'Network error';
    return Promise.reject(new Error(msg));
  }
);
