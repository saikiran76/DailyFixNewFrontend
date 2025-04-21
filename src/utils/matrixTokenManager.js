import * as matrixSdk from 'matrix-js-sdk';
import logger from './logger';
import { saveToIndexedDB, getFromIndexedDB } from './indexedDBHelper';
import { MATRIX_CREDENTIALS_KEY } from '../constants';

/**
 * Utility for managing Matrix tokens following Element Web's practices
 */
const matrixTokenManager = {
  /**
   * Validate and refresh Matrix credentials if needed
   * @param {string} userId - The Supabase user ID (used for saving refreshed credentials)
   * @param {Object} credentials - The Matrix credentials to validate
   * @returns {Promise<Object>} - The validated or refreshed credentials
   */
  async validateAndRefreshCredentials(userId, credentials) {
    // Use the userId parameter for saving refreshed credentials
    if (!credentials || !credentials.accessToken || !credentials.userId) {
      logger.warn('[matrixTokenManager] Invalid credentials format');
      return null;
    }

    try {
      // Create a temporary client to validate the token
      const tempClient = matrixSdk.createClient({
        baseUrl: credentials.homeserver || 'https://dfix-hsbridge.duckdns.org',
        accessToken: credentials.accessToken,
        userId: credentials.userId,
        useAuthorizationHeader: true
      });

      // Try a simple API call to validate the token
      logger.info('[matrixTokenManager] Validating Matrix credentials');
      await tempClient.getProfileInfo(credentials.userId);

      logger.info('[matrixTokenManager] Matrix credentials are valid');
      return credentials;
    } catch (error) {
      // Check if the error is due to an expired token
      if (error.errcode === 'M_UNKNOWN_TOKEN' ||
          (error.message && error.message.includes('token')) ||
          (error.data && error.data.error && error.data.error.includes('token'))) {
        logger.warn('[matrixTokenManager] Matrix token is expired, attempting to refresh');

        // Try to refresh the token using stored password if available
        if (credentials.password) {
          try {
            const refreshedCredentials = await this.refreshTokenWithPassword(credentials);
            // Save the refreshed credentials using the userId parameter
            await this.saveCredentials(userId, refreshedCredentials);
            return refreshedCredentials;
          } catch (refreshError) {
            logger.error('[matrixTokenManager] Failed to refresh token with password:', refreshError);
          }
        }

        // Try to refresh using the refresh token if available (Element Web style)
        if (credentials.refreshToken) {
          try {
            const refreshedCredentials = await this.refreshTokenWithRefreshToken(credentials);
            // Save the refreshed credentials using the userId parameter
            await this.saveCredentials(userId, refreshedCredentials);
            return refreshedCredentials;
          } catch (refreshError) {
            logger.error('[matrixTokenManager] Failed to refresh token with refresh token:', refreshError);
          }
        }

        // Try to re-login with stored credentials
        try {
          const refreshedCredentials = await this.reLoginWithStoredCredentials(credentials);
          // Save the refreshed credentials using the userId parameter
          await this.saveCredentials(userId, refreshedCredentials);
          return refreshedCredentials;
        } catch (loginError) {
          logger.error('[matrixTokenManager] Failed to re-login with stored credentials:', loginError);
        }
      } else {
        logger.error('[matrixTokenManager] Error validating Matrix credentials:', error);
      }

      return null;
    }
  },

  /**
   * Refresh token using stored password
   * @param {Object} credentials - The Matrix credentials
   * @returns {Promise<Object>} - The refreshed credentials
   */
  async refreshTokenWithPassword(credentials) {
    logger.info('[matrixTokenManager] Refreshing token with password');

    const client = matrixSdk.createClient({
      baseUrl: credentials.homeserver || 'https://dfix-hsbridge.duckdns.org'
    });

    // Login with username and password using the non-deprecated signature
    const loginResponse = await client.login({
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: credentials.userId
      },
      password: credentials.password,
      initial_device_display_name: `DailyFix Web Refresh ${new Date().toISOString()}`
    });

    if (!loginResponse || !loginResponse.access_token) {
      throw new Error('Login response missing access token');
    }

    logger.info('[matrixTokenManager] Successfully refreshed token with password');

    // Update credentials with new token
    const refreshedCredentials = {
      ...credentials,
      accessToken: loginResponse.access_token,
      deviceId: loginResponse.device_id || credentials.deviceId
    };

    // Save refreshed credentials
    await this.saveCredentials(credentials.userId, refreshedCredentials);

    return refreshedCredentials;
  },

  /**
   * Refresh token using refresh token (Element Web style)
   * @param {Object} credentials - The Matrix credentials
   * @returns {Promise<Object>} - The refreshed credentials
   */
  async refreshTokenWithRefreshToken(credentials) {
    logger.info('[matrixTokenManager] Refreshing token with refresh token');

    const client = matrixSdk.createClient({
      baseUrl: credentials.homeserver || 'https://dfix-hsbridge.duckdns.org'
    });

    // Use the refresh token to get a new access token
    // This is a simplified version - Element Web has a more complex implementation
    const refreshResponse = await client.refreshToken(credentials.refreshToken);

    if (!refreshResponse || !refreshResponse.access_token) {
      throw new Error('Refresh response missing access token');
    }

    logger.info('[matrixTokenManager] Successfully refreshed token with refresh token');

    // Update credentials with new tokens
    const refreshedCredentials = {
      ...credentials,
      accessToken: refreshResponse.access_token,
      refreshToken: refreshResponse.refresh_token || credentials.refreshToken
    };

    // Save refreshed credentials
    await this.saveCredentials(credentials.userId, refreshedCredentials);

    return refreshedCredentials;
  },

  /**
   * Re-login with stored credentials
   * @param {Object} credentials - The Matrix credentials
   * @returns {Promise<Object>} - The refreshed credentials
   */
  async reLoginWithStoredCredentials(credentials) {
    logger.info('[matrixTokenManager] Attempting to re-login with stored credentials');

    // Try to get stored session data from localStorage (Element Web style)
    let sessionData = null;
    try {
      const sessionStr = localStorage.getItem(`mx_session_${credentials.userId}`);
      if (sessionStr) {
        sessionData = JSON.parse(sessionStr);
      }
    } catch (e) {
      logger.warn('[matrixTokenManager] Failed to parse stored session:', e);
    }

    const client = matrixSdk.createClient({
      baseUrl: credentials.homeserver || 'https://dfix-hsbridge.duckdns.org'
    });

    let loginResponse;

    // Try to login with session data if available
    if (sessionData && sessionData.session) {
      try {
        loginResponse = await client.login({
          type: 'm.login.token',
          token: sessionData.session,
          identifier: {
            type: 'm.id.user',
            user: credentials.userId
          },
          initial_device_display_name: `DailyFix Web ReLogin ${new Date().toISOString()}`
        });
      } catch (e) {
        logger.warn('[matrixTokenManager] Failed to login with session token:', e);
      }
    }

    // Fall back to password login if available
    if (!loginResponse && credentials.password) {
      loginResponse = await client.login({
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: credentials.userId
        },
        password: credentials.password,
        initial_device_display_name: `DailyFix Web ReLogin ${new Date().toISOString()}`
      });
    }

    if (!loginResponse || !loginResponse.access_token) {
      throw new Error('Login response missing access token');
    }

    logger.info('[matrixTokenManager] Successfully re-logged in with stored credentials');

    // Update credentials with new token
    const refreshedCredentials = {
      ...credentials,
      accessToken: loginResponse.access_token,
      deviceId: loginResponse.device_id || credentials.deviceId,
      refreshToken: loginResponse.refresh_token || credentials.refreshToken
    };

    // Save refreshed credentials
    await this.saveCredentials(credentials.userId, refreshedCredentials);

    // Also save session data for future use
    if (loginResponse.session) {
      try {
        localStorage.setItem(`mx_session_${credentials.userId}`, JSON.stringify({
          session: loginResponse.session,
          lastUsed: new Date().getTime()
        }));
      } catch (e) {
        logger.warn('[matrixTokenManager] Failed to save session data:', e);
      }
    }

    return refreshedCredentials;
  },

  /**
   * Save credentials to storage
   * @param {string} userId - The Supabase user ID
   * @param {Object} credentials - The credentials to save
   */
  async saveCredentials(userId, credentials) {
    try {
      // Save to IndexedDB
      await saveToIndexedDB(userId, {
        [MATRIX_CREDENTIALS_KEY]: credentials
      });

      // Save to localStorage (custom key)
      try {
        const localStorageKey = `dailyfix_connection_${userId}`;
        const localStorageData = localStorage.getItem(localStorageKey);
        const parsedData = localStorageData ? JSON.parse(localStorageData) : {};
        parsedData.matrix_credentials = credentials;
        localStorage.setItem(localStorageKey, JSON.stringify(parsedData));
      } catch (e) {
        logger.warn('[matrixTokenManager] Failed to save to localStorage (custom key):', e);
      }

      // Save to Element-style localStorage keys
      try {
        localStorage.setItem('mx_access_token', credentials.accessToken);
        localStorage.setItem('mx_user_id', credentials.userId);
        localStorage.setItem('mx_device_id', credentials.deviceId);
        localStorage.setItem('mx_hs_url', credentials.homeserver);

        if (credentials.refreshToken) {
          localStorage.setItem('mx_refresh_token', credentials.refreshToken);
        }
      } catch (e) {
        logger.warn('[matrixTokenManager] Failed to save to localStorage (Element-style):', e);
      }

      logger.info('[matrixTokenManager] Successfully saved credentials to storage');
    } catch (error) {
      logger.error('[matrixTokenManager] Error saving credentials:', error);
      throw error;
    }
  },

  /**
   * Get Matrix credentials from all available sources
   * @param {string} userId - The Supabase user ID
   * @returns {Promise<Object>} - The Matrix credentials
   */
  async getCredentials(userId) {
    let credentials = null;

    // Try to get from IndexedDB
    try {
      const indexedDBData = await getFromIndexedDB(userId);
      if (indexedDBData && indexedDBData[MATRIX_CREDENTIALS_KEY]) {
        credentials = indexedDBData[MATRIX_CREDENTIALS_KEY];
        logger.info('[matrixTokenManager] Found credentials in IndexedDB');

        // Validate and refresh if needed
        const validCredentials = await this.validateAndRefreshCredentials(userId, credentials);
        if (validCredentials) {
          return validCredentials;
        }
      }
    } catch (e) {
      logger.warn('[matrixTokenManager] Failed to get from IndexedDB:', e);
    }

    // Try to get from localStorage (custom key)
    try {
      const localStorageKey = `dailyfix_connection_${userId}`;
      const localStorageData = localStorage.getItem(localStorageKey);
      if (localStorageData) {
        const parsedData = JSON.parse(localStorageData);
        if (parsedData.matrix_credentials) {
          credentials = parsedData.matrix_credentials;
          logger.info('[matrixTokenManager] Found credentials in localStorage (custom key)');

          // Validate and refresh if needed
          const validCredentials = await this.validateAndRefreshCredentials(userId, credentials);
          if (validCredentials) {
            return validCredentials;
          }
        }
      }
    } catch (e) {
      logger.warn('[matrixTokenManager] Failed to get from localStorage (custom key):', e);
    }

    // Try to get from Element-style localStorage keys
    try {
      const mx_access_token = localStorage.getItem('mx_access_token');
      const mx_user_id = localStorage.getItem('mx_user_id');
      const mx_device_id = localStorage.getItem('mx_device_id');
      const mx_hs_url = localStorage.getItem('mx_hs_url');
      const mx_refresh_token = localStorage.getItem('mx_refresh_token');

      if (mx_access_token && mx_user_id) {
        credentials = {
          accessToken: mx_access_token,
          userId: mx_user_id,
          deviceId: mx_device_id,
          homeserver: mx_hs_url || 'https://dfix-hsbridge.duckdns.org',
          refreshToken: mx_refresh_token
        };
        logger.info('[matrixTokenManager] Found credentials in localStorage (Element-style)');

        // Validate and refresh if needed
        const validCredentials = await this.validateAndRefreshCredentials(userId, credentials);
        if (validCredentials) {
          return validCredentials;
        }
      }
    } catch (e) {
      logger.warn('[matrixTokenManager] Failed to get from localStorage (Element-style):', e);
    }

    // Try to get from API
    try {
      // This would be implemented to fetch from your backend API
      // Similar to how it's done in the PlatformConnectionModal
    } catch (e) {
      logger.warn('[matrixTokenManager] Failed to get from API:', e);
    }

    return null;
  }
};

export default matrixTokenManager;
