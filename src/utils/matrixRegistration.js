import * as matrixSdk from 'matrix-js-sdk';
import logger from './logger';
import { saveToIndexedDB } from './indexedDBHelper';
import { MATRIX_CREDENTIALS_KEY } from '../constants';

/**
 * Utility for registering a Matrix account directly from the client
 * Following Element-Web's architecture for Matrix registration
 */
const matrixRegistration = {
  /**
   * Register a new Matrix account for the user
   * @param {string} userId - The Supabase user ID
   * @returns {Promise<Object>} - The Matrix credentials
   */
  async registerMatrixAccount(userId) {
    try {
      logger.info('[matrixRegistration] Registering new Matrix account for user:', userId);
      logger.info('[matrixRegistration] Matrix SDK available:', !!matrixSdk);

      // Generate a secure password
      const generatePassword = () => {
        const array = new Uint8Array(24);
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      };

      // Create Matrix username based on user ID
      const username = `user${userId.replace(/-/g, '')}matrixttestkoraca`;
      const password = generatePassword();
      const homeserver = 'https://dfix-hsbridge.duckdns.org';

      logger.info('[matrixRegistration] Creating Matrix client for registration');

      // Create a temporary Matrix client to do the registration
      logger.info('[matrixRegistration] Creating Matrix client for registration with homeserver:', homeserver);

      if (!matrixSdk.createClient) {
        throw new Error('Matrix SDK createClient method not found');
      }

      const client = matrixSdk.createClient({
        baseUrl: homeserver
      });

      if (!client) {
        throw new Error('Failed to create Matrix client');
      }

      logger.info('[matrixRegistration] Matrix client created successfully');

      // Try using the standard register method from matrix-js-sdk
      try {
        logger.info('[matrixRegistration] Attempting registration with standard register method');

        if (!client.register) {
          throw new Error('Matrix client register method not found');
        }

        logger.info('[matrixRegistration] Calling register with username:', username);

        // Try with standard register method
        const registerResponse = await client.register(
          username,
          password,
          null, // device ID (auto-generated)
          { type: 'm.login.dummy' }, // auth
          { initial_device_display_name: `DailyFix Web ${new Date().toISOString()}` } // extra params
        );

        if (!registerResponse) {
          throw new Error('No response from Matrix registration');
        }

        logger.info('[matrixRegistration] Registration response received:', {
          userId: registerResponse.user_id ? 'present' : 'missing',
          accessToken: registerResponse.access_token ? 'present' : 'missing',
          deviceId: registerResponse.device_id ? 'present' : 'missing'
        });

        logger.info('[matrixRegistration] Registration successful with dummy auth');

        // Return the credentials
        const credentials = {
          userId: registerResponse.user_id,
          accessToken: registerResponse.access_token,
          deviceId: registerResponse.device_id,
          homeserver: homeserver,
          password: password // Store password for potential future use
        };

        // Save credentials to IndexedDB
        await saveToIndexedDB(userId, {
          [MATRIX_CREDENTIALS_KEY]: credentials
        });

        // Also save to localStorage for redundancy
        try {
          const localStorageKey = `dailyfix_connection_${userId}`;
          const existingData = localStorage.getItem(localStorageKey);
          const parsedData = existingData ? JSON.parse(existingData) : {};
          parsedData.matrix_credentials = credentials;
          localStorage.setItem(localStorageKey, JSON.stringify(parsedData));

          // Also save in Element-style localStorage keys
          localStorage.setItem('mx_access_token', credentials.accessToken);
          localStorage.setItem('mx_user_id', credentials.userId);
          localStorage.setItem('mx_device_id', credentials.deviceId);
          localStorage.setItem('mx_hs_url', credentials.homeserver);
        } catch (storageError) {
          logger.error('[matrixRegistration] Error saving to localStorage:', storageError);
        }

        return credentials;
      } catch (dummyAuthError) {
        // If dummy auth fails, the server might require a different auth type
        logger.warn('[matrixRegistration] Dummy auth failed, checking required auth type:', dummyAuthError);

        // Check if we got a session ID and required stages
        if (dummyAuthError.data && dummyAuthError.data.session) {
          const session = dummyAuthError.data.session;
          const flows = dummyAuthError.data.flows || [];

          // Find a flow that we can complete
          for (const flow of flows) {
            if (flow.stages && flow.stages.includes('m.login.dummy')) {
              logger.info('[matrixRegistration] Found flow with m.login.dummy, attempting registration');

              const registerResponse = await client.registerRequest({
                username,
                password,
                initial_device_display_name: `DailyFix Web ${new Date().toISOString()}`,
                auth: {
                  session,
                  type: 'm.login.dummy'
                }
              });

              logger.info('[matrixRegistration] Registration successful with session auth');

              // Return the credentials
              const credentials = {
                userId: registerResponse.user_id,
                accessToken: registerResponse.access_token,
                deviceId: registerResponse.device_id,
                homeserver: homeserver,
                password: password
              };

              // Save credentials to IndexedDB
              await saveToIndexedDB(userId, {
                [MATRIX_CREDENTIALS_KEY]: credentials
              });

              // Also save to localStorage for redundancy
              try {
                const localStorageKey = `dailyfix_connection_${userId}`;
                const existingData = localStorage.getItem(localStorageKey);
                const parsedData = existingData ? JSON.parse(existingData) : {};
                parsedData.matrix_credentials = credentials;
                localStorage.setItem(localStorageKey, JSON.stringify(parsedData));

                // Also save in Element-style localStorage keys
                localStorage.setItem('mx_access_token', credentials.accessToken);
                localStorage.setItem('mx_user_id', credentials.userId);
                localStorage.setItem('mx_device_id', credentials.deviceId);
                localStorage.setItem('mx_hs_url', credentials.homeserver);
              } catch (storageError) {
                logger.error('[matrixRegistration] Error saving to localStorage:', storageError);
              }

              return credentials;
            }
          }
        }

        // If we get here, we couldn't find a suitable auth flow
        throw new Error('No suitable authentication flow found for Matrix registration');
      }
    } catch (error) {
      logger.error('[matrixRegistration] Error registering Matrix account:', error);

      // Try to login with the generated credentials as a fallback
      // This is useful if the user already has an account but we couldn't find the credentials
      try {
        logger.info('[matrixRegistration] Registration failed, attempting login as fallback');

        const username = `user${userId.replace(/-/g, '')}matrixttestkoraca`;
        const homeserver = 'https://dfix-hsbridge.duckdns.org';

        // Create a temporary Matrix client for login
        const loginClient = matrixSdk.createClient({
          baseUrl: homeserver
        });

        // Try to login with a default password
        const loginResponse = await loginClient.login('m.login.password', {
          user: username,
          password: 'DailyFixSecurePassword2023!',  // Default password for testing
          initial_device_display_name: `DailyFix Web Fallback ${new Date().toISOString()}`
        });

        if (loginResponse && loginResponse.access_token) {
          logger.info('[matrixRegistration] Fallback login successful');

          // Return the credentials
          const credentials = {
            userId: loginResponse.user_id,
            accessToken: loginResponse.access_token,
            deviceId: loginResponse.device_id,
            homeserver: homeserver
          };

          // Save credentials to IndexedDB
          await saveToIndexedDB(userId, {
            [MATRIX_CREDENTIALS_KEY]: credentials
          });

          return credentials;
        }
      } catch (loginError) {
        logger.error('[matrixRegistration] Fallback login also failed:', loginError);
      }

      // If all attempts fail, throw the original error
      throw error;
    }
  }
};

export default matrixRegistration;
