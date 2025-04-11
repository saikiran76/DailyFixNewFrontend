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
    let token = null;
    
    try {
      token = await tokenManager.getValidToken();
    } catch (tokenError) {
      console.error('[API] Error getting token from tokenManager:', tokenError);
      
      // Fallback token retrieval if tokenManager fails
      token = localStorage.getItem('access_token');
      
      // If token not found in access_token, try to get from dailyfix_auth
      if (!token) {
        const authDataStr = localStorage.getItem('dailyfix_auth');
        if (authDataStr) {
          try {
            const authData = JSON.parse(authDataStr);
            token = authData.session?.access_token;
            logger.info('[API] Retrieved token from dailyfix_auth');
          } catch (e) {
            logger.error('[API] Error parsing auth data:', e);
          }
        }
      }
      
      // If still no token, try to get from persist:auth (Redux persisted state)
      if (!token) {
        const authStr = localStorage.getItem('persist:auth');
        if (authStr) {
          try {
            const authData = JSON.parse(authStr);
            const sessionData = JSON.parse(authData.session);
            token = sessionData?.access_token;
            logger.info('[API] Retrieved token from persist:auth');
          } catch (e) {
            logger.error('[API] Error parsing persisted auth data:', e);
          }
        }
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      logger.info('[API] Added Authorization header');
    } else {
      logger.warn('[API] No token available for request');
    }

    return config;
  } catch (error) {
    logger.error('[API] Error setting auth token:', error);
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

    // CRITICAL FIX: Improved token refresh handling
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      logger.info('[API] Received 401 error, attempting to refresh token');

      try {
        // Force token refresh
        const newToken = await tokenManager.refreshToken();

        if (newToken) {
          logger.info('[API] Token refreshed successfully, retrying request');
          // Update the Authorization header with the new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          // Also update the default headers for future requests
          api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          logger.error('[API] Token refresh returned null token');
          // If we're on a protected route and token refresh failed, redirect to login
          if (!window.location.pathname.includes('/login') &&
              !window.location.pathname.includes('/auth/callback')) {
            logger.info('[API] Redirecting to login due to authentication failure');
            window.location.href = '/login';
          }
        }
      } catch (refreshError) {
        logger.error('[API] Token refresh failed:', refreshError);
        // If we're on a protected route and token refresh failed, redirect to login
        if (!window.location.pathname.includes('/login') &&
            !window.location.pathname.includes('/auth/callback')) {
          logger.info('[API] Redirecting to login due to authentication failure');
          window.location.href = '/login';
        }
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