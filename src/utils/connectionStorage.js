/**
 * Utility for managing connection status in browser storage
 * Provides a fallback mechanism when backend updates fail
 */
import logger from './logger';

const STORAGE_KEY = 'dailyfix_connection_status';

/**
 * Save connection status to localStorage
 * @param {Object} status - Connection status object
 * @param {string} userId - User ID
 */
export const saveConnectionStatus = (status, userId) => {
  try {
    const storageData = {
      userId,
      timestamp: Date.now(),
      status
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
    logger.info('[ConnectionStorage] Saved connection status to localStorage:', status);
  } catch (error) {
    logger.error('[ConnectionStorage] Failed to save connection status:', error);
  }
};

/**
 * Get connection status from localStorage
 * @param {string} userId - User ID
 * @returns {Object|null} Connection status object or null if not found
 */
export const getConnectionStatus = (userId) => {
  try {
    const storageData = JSON.parse(localStorage.getItem(STORAGE_KEY));

    // Check if data exists and belongs to the current user
    if (storageData && storageData.userId === userId) {
      logger.info('[ConnectionStorage] Retrieved connection status from localStorage:', storageData.status);
      return storageData.status;
    }

    return null;
  } catch (error) {
    logger.error('[ConnectionStorage] Failed to retrieve connection status:', error);
    return null;
  }
};

/**
 * Clear connection status from localStorage
 */
export const clearConnectionStatus = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    logger.info('[ConnectionStorage] Cleared connection status from localStorage');
  } catch (error) {
    logger.error('[ConnectionStorage] Failed to clear connection status:', error);
  }
};

/**
 * Check if WhatsApp is connected based on localStorage data and Redux state
 * @param {string} userId - User ID
 * @returns {boolean} True if WhatsApp is connected
 */
export const isWhatsAppConnected = (userId) => {
  // First check localStorage
  const status = getConnectionStatus(userId);
  if (status && status.whatsapp === true) {
    logger.info('[ConnectionStorage] WhatsApp connected according to localStorage');
    return true;
  }

  // Also check if we have a session with WhatsApp in localStorage
  try {
    const authDataStr = localStorage.getItem('dailyfix_auth');
    if (authDataStr) {
      const authData = JSON.parse(authDataStr);
      if (authData && authData.whatsappConnected === true) {
        logger.info('[ConnectionStorage] WhatsApp connected according to auth data');
        return true;
      }
    }
  } catch (error) {
    logger.error('[ConnectionStorage] Error checking auth data for WhatsApp connection:', error);
  }

  return false;
};

/**
 * Save WhatsApp connection status
 * @param {boolean} connected - Whether WhatsApp is connected
 * @param {string} userId - User ID
 */
export const saveWhatsAppStatus = (connected, userId) => {
  const currentStatus = getConnectionStatus(userId) || {};
  saveConnectionStatus({
    ...currentStatus,
    whatsapp: connected
  }, userId);
};
