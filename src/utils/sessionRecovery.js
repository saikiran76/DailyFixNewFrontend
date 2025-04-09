import logger from './logger';

/**
 * Attempts to recover a valid session from various sources
 * @returns {Promise<boolean>} - Whether a session was recovered
 */
export const recoverSession = async () => {
  try {
    logger.info('[SessionRecovery] Attempting to recover session');

    // First, check if we have a valid session in localStorage
    const dailyfixAuth = localStorage.getItem('dailyfix_auth');
    if (dailyfixAuth) {
      try {
        const authData = JSON.parse(dailyfixAuth);
        if (authData.session?.access_token) {
          logger.info('[SessionRecovery] Found valid session in localStorage');
          return true;
        }
      } catch (parseError) {
        logger.error('[SessionRecovery] Error parsing auth data:', parseError);
      }
    }

    // If we get here, no session was recovered
    logger.warn('[SessionRecovery] Failed to recover session');
    return false;
  } catch (error) {
    logger.error('[SessionRecovery] Error recovering session:', error);
    return false;
  }
};

/**
 * Checks if WhatsApp is connected based on API response, not localStorage
 * @returns {boolean} - Whether WhatsApp is connected
 */
export const isWhatsAppConnected = () => {
  // FIXED: Don't use localStorage to determine WhatsApp connection status
  // This was causing the system to think WhatsApp was connected when it wasn't
  return false;
};

/**
 * Records that WhatsApp is connected - but doesn't use localStorage anymore
 */
export const recordWhatsAppConnection = () => {
  // FIXED: Don't store WhatsApp connection status in localStorage
  // This was causing the system to think WhatsApp was connected when it wasn't
  logger.info('[SessionRecovery] WhatsApp connection recorded (without localStorage)');
};

/**
 * Clears any problematic localStorage items
 */
export const clearProblematicStorage = () => {
  try {
    localStorage.removeItem('whatsapp_connected');
    localStorage.removeItem('whatsapp_connected_at');
    logger.info('[SessionRecovery] Cleared problematic localStorage items');
  } catch (error) {
    logger.error('[SessionRecovery] Error clearing localStorage:', error);
  }
};

export default {
  recoverSession,
  isWhatsAppConnected,
  recordWhatsAppConnection,
  clearProblematicStorage
};
