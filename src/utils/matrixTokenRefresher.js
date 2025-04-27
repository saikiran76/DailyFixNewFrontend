import * as matrixSdk from 'matrix-js-sdk';
import logger from './logger';
import matrixDirectConnect from './matrixDirectConnect';
import { saveToIndexedDB, getFromIndexedDB } from './indexedDBHelper';
import { MATRIX_CREDENTIALS_KEY } from '../constants';

/**
 * Utility for refreshing Matrix tokens
 */
const matrixTokenRefresher = {
  /**
   * Check if the Matrix client is valid and refresh if needed
   * @param {Object} client - The Matrix client to check
   * @param {string} userId - The Supabase user ID
   * @returns {Promise<Object>} - A valid Matrix client
   */
  async ensureValidClient(client, userId) {
    try {
      // Check if client is valid
      if (!client) {
        logger.warn('[matrixTokenRefresher] No client provided, creating new one');
        return this.refreshClient(userId);
      }

      // Check if client is properly initialized
      try {
        const syncState = client.getSyncState();
        logger.info(`[matrixTokenRefresher] Client sync state: ${syncState}`);

        // If client is in ERROR state or null, refresh
        if (!syncState || syncState === 'ERROR') {
          logger.warn(`[matrixTokenRefresher] Client in ${syncState} state, refreshing`);
          return this.refreshClient(userId);
        }

        // Try a simple API call to validate the token
        await client.whoami();
        logger.info('[matrixTokenRefresher] Client token is valid');
        return client;
      } catch (error) {
        // If we get an unauthorized error, refresh the client
        if (error.errcode === 'M_UNKNOWN_TOKEN' ||
            (error.message && error.message.includes('token')) ||
            (error.data && error.data.error && error.data.error.includes('token'))) {
          logger.warn('[matrixTokenRefresher] Token is invalid or expired, refreshing client');
          return this.refreshClient(userId);
        }

        // For other errors, log and continue
        logger.error('[matrixTokenRefresher] Error checking client:', error);
        return client;
      }
    } catch (error) {
      logger.error('[matrixTokenRefresher] Error ensuring valid client:', error);
      return this.refreshClient(userId);
    }
  },

  /**
   * Refresh the Matrix client
   * @param {string} userId - The Supabase user ID
   * @returns {Promise<Object>} - A new Matrix client
   */
  async refreshClient(userId) {
    try {
      logger.info('[matrixTokenRefresher] Refreshing Matrix client');

      // Set a flag to indicate we're refreshing the token
      sessionStorage.setItem('matrix_token_refreshing', 'true');

      // Prevent multiple simultaneous refresh attempts
      if (this._refreshInProgress) {
        logger.warn('[matrixTokenRefresher] Refresh already in progress, waiting...');
        try {
          await this._refreshPromise;
          logger.info('[matrixTokenRefresher] Previous refresh completed, returning client');
          // Clear the refresh flag
          sessionStorage.removeItem('matrix_token_refreshing');
          return window.matrixClient;
        } catch (e) {
          logger.warn('[matrixTokenRefresher] Previous refresh failed, continuing with new refresh');
        }
      }

      // Set up refresh promise
      this._refreshInProgress = true;
      this._refreshPromise = (async () => {
        try {
          // Store the old client's user ID before stopping it
          const oldUserId = window.matrixClient ? window.matrixClient.getUserId() : null;

          // Stop the existing client if it exists
          if (window.matrixClient) {
            try {
              if (window.matrixClient.clientRunning) {
                await window.matrixClient.stopClient();
              }
              window.matrixClient = null;
            } catch (e) {
              logger.warn('[matrixTokenRefresher] Error stopping existing client:', e);
            }
          }

          // Connect to Matrix using our direct connect utility
          logger.info('[matrixTokenRefresher] Connecting to Matrix for token refresh');
          const newClient = await matrixDirectConnect.connectToMatrix(userId);

          // Set the global Matrix client
          window.matrixClient = newClient;

          // Start the client
          await matrixDirectConnect.startClient(newClient);

          // If this was for Telegram, make sure the flag is still set
          // This ensures future refreshes will work
          if (oldUserId && oldUserId.includes('@telegram_')) {
            logger.info('[matrixTokenRefresher] Preserving Telegram connection flag for future refreshes');
            sessionStorage.setItem('connecting_to_telegram', 'true');
          }

          logger.info('[matrixTokenRefresher] Successfully refreshed Matrix client');
          return newClient;
        } finally {
          this._refreshInProgress = false;
          // Clear the refresh flag
          sessionStorage.removeItem('matrix_token_refreshing');
        }
      })();

      return await this._refreshPromise;
    } catch (error) {
      logger.error('[matrixTokenRefresher] Error refreshing client:', error);

      // Prevent alert loops by suppressing errors for a short time
      if (!this._errorSuppressed) {
        this._errorSuppressed = true;
        setTimeout(() => {
          this._errorSuppressed = false;
        }, 10000); // Suppress errors for 10 seconds

        // Only throw the error if we're not suppressing errors
        throw error;
      } else {
        logger.warn('[matrixTokenRefresher] Suppressing additional error alerts');
        return null;
      }
    }
  },

  /**
   * Set up token refresh listeners on a client
   * @param {Object} client - The Matrix client
   * @param {string} userId - The Supabase user ID
   */
  setupRefreshListeners(client, userId) {
    if (!client) return;

    // Initialize refresh state tracking
    this._refreshInProgress = false;
    this._refreshPromise = null;
    this._errorSuppressed = false;
    this._lastRefreshAttempt = 0;
    this._refreshCooldown = 5000; // 5 seconds between refresh attempts

    // Remove any existing listeners
    client.removeAllListeners('Session.logged_out');
    client.removeAllListeners('sync');

    // Listen for logout events
    client.on('Session.logged_out', () => {
      logger.warn('[matrixTokenRefresher] Session logged out, refreshing client');

      // Check if we're in cooldown period
      const now = Date.now();
      if (now - this._lastRefreshAttempt < this._refreshCooldown) {
        logger.warn('[matrixTokenRefresher] In cooldown period, skipping refresh');
        return;
      }

      this._lastRefreshAttempt = now;

      this.refreshClient(userId).catch(error => {
        logger.error('[matrixTokenRefresher] Error refreshing client after logout:', error);
      });
    });

    // Listen for sync state changes
    client.on('sync', (state, prevState, data) => {
      logger.info(`[matrixTokenRefresher] Sync state changed: ${prevState} -> ${state}`);

      // If sync state changes to ERROR, check if it's a token issue
      if (state === 'ERROR') {
        logger.warn('[matrixTokenRefresher] Sync error, checking if token is valid');

        // Check if the error is related to the token
        const error = data ? data.error : null;
        if (error && (
            error.errcode === 'M_UNKNOWN_TOKEN' ||
            (error.message && error.message.includes('token')) ||
            (error.data && error.data.error && error.data.error.includes('token'))
        )) {
          // Check if we're in cooldown period
          const now = Date.now();
          if (now - this._lastRefreshAttempt < this._refreshCooldown) {
            logger.warn('[matrixTokenRefresher] In cooldown period, skipping refresh');
            return;
          }

          this._lastRefreshAttempt = now;

          logger.warn('[matrixTokenRefresher] Token error detected, refreshing client');
          this.refreshClient(userId).catch(refreshError => {
            logger.error('[matrixTokenRefresher] Error refreshing client after sync error:', refreshError);
          });
        }
      }
    });

    // Listen for request errors
    client.on('request', (request) => {
      request.on('error', (error) => {
        if (error.errcode === 'M_UNKNOWN_TOKEN' ||
            (error.message && error.message.includes('token')) ||
            (error.data && error.data.error && error.data.error.includes('token'))) {
          // Check if we're in cooldown period
          const now = Date.now();
          if (now - this._lastRefreshAttempt < this._refreshCooldown) {
            logger.warn('[matrixTokenRefresher] In cooldown period, skipping refresh');
            return;
          }

          this._lastRefreshAttempt = now;

          logger.warn('[matrixTokenRefresher] Token error in request:', error);
          this.refreshClient(userId).catch(refreshError => {
            logger.error('[matrixTokenRefresher] Error refreshing client after request error:', refreshError);
          });
        }
      });
    });

    // Set up a global error handler to suppress Matrix auth alerts
    if (!window._matrixErrorHandlerInstalled) {
      const originalAlert = window.alert;
      window.alert = function(message) {
        if (typeof message === 'string' &&
            (message.includes('session') ||
             message.includes('expired') ||
             message.includes('log in') ||
             message.includes('Matrix'))) {
          logger.warn('[matrixTokenRefresher] Suppressing Matrix auth alert:', message);
          // Instead of showing an alert, try to refresh the client
          const now = Date.now();
          if (now - matrixTokenRefresher._lastRefreshAttempt > matrixTokenRefresher._refreshCooldown) {
            matrixTokenRefresher._lastRefreshAttempt = now;
            if (window.matrixClient && userId) {
              matrixTokenRefresher.refreshClient(userId).catch(e => {
                logger.error('[matrixTokenRefresher] Error refreshing after alert suppression:', e);
              });
            }
          }
          return;
        }
        return originalAlert.call(this, message);
      };
      window._matrixErrorHandlerInstalled = true;
    }

    logger.info('[matrixTokenRefresher] Set up refresh listeners');
  }
};

export default matrixTokenRefresher;
