/**
 * AI Service Configuration
 * 
 * This file contains configuration for the AI bot service.
 * Update the API_URL to point to your deployed AI bot service.
 */

// Default to localhost for development
const DEFAULT_API_URL = 'http://localhost:8000';

// Get the API URL from environment variables if available
export const API_URL = import.meta.env.VITE_AI_SERVICE_URL || DEFAULT_API_URL;

// API endpoints
export const ENDPOINTS = {
  QUERY: `${API_URL}/api/v1/query`,
  INDEX_MESSAGES: `${API_URL}/api/v1/index-messages`,
  BATCH_INDEX: `${API_URL}/api/v1/indexeddb/batch`,
};

// Configuration options
export const CONFIG = {
  // Maximum number of messages to include in context
  MAX_CONTEXT_MESSAGES: 20,
  
  // Maximum number of recent queries to store
  MAX_RECENT_QUERIES: 10,
  
  // Retry configuration
  RETRY: {
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
  },
};

export default {
  API_URL,
  ENDPOINTS,
  CONFIG,
};
