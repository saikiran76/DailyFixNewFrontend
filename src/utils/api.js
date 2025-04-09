import axios from 'axios';
import { supabase } from './supabase';
import { toast } from 'react-toastify';
import { tokenManager } from './tokenManager';
import logger from './logger';

// Standard response structure
export const ResponseStatus = {
  SUCCESS: 'success',
  ERROR: 'error',
  RATE_LIMITED: 'rate_limited',
  PARTIAL: 'partial'
};

// Standard error types
export const ErrorTypes = {
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  RATE_LIMIT: 'rate_limit',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  VALIDATION_ERROR: 'validation_error',
  SERVICE_UNAVAILABLE: 'service_unavailable'
};

// API response validator
export const validateResponse = (data, schema) => {
  if (!data) return false;
  
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in data)) return false;
    if (typeof data[key] !== type) return false;
  }
  
  return true;
};

// Standard response schemas
export const ResponseSchemas = {
  servers: {
    id: 'string',
    name: 'string',
    icon: 'string'
  },
  directMessages: {
    id: 'string',
    recipients: 'object'
  },
  status: {
    status: 'string',
    message: 'string'
  }
};

// Create unified API instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000",
  timeout: 180000, // 180 seconds
  withCredentials: false, // Changed from true to false to avoid CORS issues
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Add request interceptor to set auth token
api.interceptors.request.use(async (config) => {
  try {
    // Get token from token manager
    const token = await tokenManager.getValidToken();
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  } catch (error) {
    logger.info('[API] Error setting auth token:', error);
    return config;
  }
}, (error) => {
  return Promise.reject(error);
});

// Add response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to get a fresh token
        const newToken = await tokenManager.getValidToken(null, true);
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        logger.info('[API] Token refresh failed:', refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Helper method to get current auth state
api.getAuthState = async () => {
  try {
    const token = await tokenManager.getValidToken();
    if (!token) return null;

    const session = await supabase.auth.getSession();
    return session?.data?.session || null;
  } catch (error) {
    console.error('Error getting auth state:', error);
    return null;
  }
};

export default api; 