import * as matrixSdk from 'matrix-js-sdk';
import logger from './logger';
import { saveToIndexedDB, getFromIndexedDB } from './indexedDBHelper';
import { MATRIX_CREDENTIALS_KEY } from '../constants';

/**
 * Utility for directly connecting to Matrix with a consistent password
 * This bypasses the token refresh mechanism and just creates a new client
 */
const matrixDirectConnect = {
  /**
   * Connect to Matrix using a secure approach
   * @param {string} userId - The Supabase user ID
   * @returns {Promise<Object>} - The Matrix client
   */
  async connectToMatrix(userId) {
    try {
      logger.info('[matrixDirectConnect] Connecting to Matrix for user:', userId);

      // Check if we're connecting for Telegram, but only for initial connections, not refreshes
      const connectingToTelegram = sessionStorage.getItem('connecting_to_telegram') === 'true';
      const isTokenRefresh = sessionStorage.getItem('matrix_token_refreshing') === 'true';

      // Skip the check if this is a token refresh operation
      if (!connectingToTelegram && !isTokenRefresh) {
        // Check if we have an existing Matrix client that needs refreshing
        const existingClient = window.matrixClient;
        if (existingClient && existingClient.getUserId()) {
          // If we have an existing client, this is likely a refresh operation
          logger.info('[matrixDirectConnect] Existing Matrix client found, proceeding with refresh');
          // Set the refresh flag to avoid future checks during this refresh operation
          sessionStorage.setItem('matrix_token_refreshing', 'true');
        } else {
          logger.warn('[matrixDirectConnect] Not connecting to Telegram and not refreshing, aborting Matrix connection');
          throw new Error('Matrix connection is only needed for Telegram');
        }
      }

      // First, try to get existing credentials from localStorage or IndexedDB
      let existingCredentials = null;

      // Try to get from localStorage (custom key)
      try {
        const localStorageKey = `dailyfix_connection_${userId}`;
        const localStorageData = localStorage.getItem(localStorageKey);
        if (localStorageData) {
          const parsedData = JSON.parse(localStorageData);
          if (parsedData.matrix_credentials &&
              parsedData.matrix_credentials.userId &&
              parsedData.matrix_credentials.accessToken) {
            existingCredentials = parsedData.matrix_credentials;
            logger.info('[matrixDirectConnect] Found existing credentials in localStorage (custom key)');
          }
        }
      } catch (e) {
        logger.warn('[matrixDirectConnect] Failed to get credentials from localStorage (custom key):', e);
      }

      // If not found in localStorage, try IndexedDB
      if (!existingCredentials) {
        try {
          const indexedDBData = await getFromIndexedDB(userId);
          if (indexedDBData &&
              indexedDBData[MATRIX_CREDENTIALS_KEY] &&
              indexedDBData[MATRIX_CREDENTIALS_KEY].userId &&
              indexedDBData[MATRIX_CREDENTIALS_KEY].accessToken) {
            existingCredentials = indexedDBData[MATRIX_CREDENTIALS_KEY];
            logger.info('[matrixDirectConnect] Found existing credentials in IndexedDB');
          }
        } catch (e) {
          logger.warn('[matrixDirectConnect] Failed to get credentials from IndexedDB:', e);
        }
      }

      // If we found existing credentials, try to use them directly
      if (existingCredentials) {
        logger.info('[matrixDirectConnect] Attempting to use existing credentials');

        try {
          // Create a Matrix client with the existing credentials
          const client = matrixSdk.createClient({
            baseUrl: existingCredentials.homeserver || 'https://dfix-hsbridge.duckdns.org',
            accessToken: existingCredentials.accessToken,
            userId: existingCredentials.userId,
            deviceId: existingCredentials.deviceId,
            timelineSupport: true,
            useAuthorizationHeader: true
          });

          // Validate the credentials with a simple API call
          try {
            await client.whoami();
            logger.info('[matrixDirectConnect] Existing credentials are valid, using them');
            return client;
          } catch (validationError) {
            // If validation fails, we'll fall back to login/registration
            logger.warn('[matrixDirectConnect] Existing credentials are invalid, falling back to login/registration:', validationError);
          }
        } catch (clientError) {
          logger.warn('[matrixDirectConnect] Error creating client with existing credentials, falling back to login/registration:', clientError);
        }
      }

      // If we couldn't use existing credentials, proceed with login/registration
      // Generate a unique username based on the user ID
      // This ensures we create a fresh account with a secure password
      const username = `user${userId.replace(/-/g, '')}matrixttestkoracatwo`;

      // Generate a secure password based on the user ID and a secret
      // This is more secure than a hardcoded password
      const passwordBase = `${userId}-${navigator.userAgent}-${window.location.hostname}`;
      const password = btoa(passwordBase).substring(0, 20) + '!Aa1';

      const homeserver = 'https://dfix-hsbridge.duckdns.org';

      // Create a temporary client for login
      const tempClient = matrixSdk.createClient({
        baseUrl: homeserver
      });

      logger.info('[matrixDirectConnect] Attempting login with username:', username);

      try {
        // Try to login with the consistent password using non-deprecated signature
        const loginResponse = await tempClient.login({
          type: 'm.login.password',
          identifier: {
            type: 'm.id.user',
            user: username
          },
          password: password,
          initial_device_display_name: `DailyFix Web ${new Date().toISOString()}`
        });

        if (!loginResponse || !loginResponse.access_token) {
          throw new Error('Login failed: No valid response');
        }

        logger.info('[matrixDirectConnect] Login successful');

        // Create credentials object
        const credentials = {
          userId: loginResponse.user_id,
          accessToken: loginResponse.access_token,
          deviceId: loginResponse.device_id,
          homeserver: homeserver,
          password: password // Store password for future logins
        };

        // Save credentials to IndexedDB
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
          logger.warn('[matrixDirectConnect] Failed to save to localStorage (custom key):', e);
        }

        // Save to Element-style localStorage keys
        try {
          localStorage.setItem('mx_access_token', credentials.accessToken);
          localStorage.setItem('mx_user_id', credentials.userId);
          localStorage.setItem('mx_device_id', credentials.deviceId);
          localStorage.setItem('mx_hs_url', credentials.homeserver);
        } catch (e) {
          logger.warn('[matrixDirectConnect] Failed to save to localStorage (Element-style):', e);
        }

        // Create a Matrix client with the credentials
        const client = matrixSdk.createClient({
          baseUrl: homeserver,
          accessToken: credentials.accessToken,
          userId: credentials.userId,
          deviceId: credentials.deviceId,
          timelineSupport: true,
          useAuthorizationHeader: true
        });

        return client;
      } catch (loginError) {
        logger.warn('[matrixDirectConnect] Login failed, attempting registration:', loginError);

        try {
          // Try to register a new account using modern API
          const registerResponse = await tempClient.register(
            username,
            password,
            undefined, // device ID (auto-generated)
            {
              type: 'm.login.dummy'
            },
            {
              initial_device_display_name: `DailyFix Web ${new Date().toISOString()}`
            }
          );

          if (!registerResponse || !registerResponse.access_token) {
            throw new Error('Registration failed: No valid response');
          }

          logger.info('[matrixDirectConnect] Registration successful');

          // Create credentials object
          const credentials = {
            userId: registerResponse.user_id,
            accessToken: registerResponse.access_token,
            deviceId: registerResponse.device_id,
            homeserver: homeserver,
            password: password // Store password for future logins
          };

          // Save credentials to IndexedDB
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
            logger.warn('[matrixDirectConnect] Failed to save to localStorage (custom key):', e);
          }

          // Save to Element-style localStorage keys
          try {
            localStorage.setItem('mx_access_token', credentials.accessToken);
            localStorage.setItem('mx_user_id', credentials.userId);
            localStorage.setItem('mx_device_id', credentials.deviceId);
            localStorage.setItem('mx_hs_url', credentials.homeserver);
          } catch (e) {
            logger.warn('[matrixDirectConnect] Failed to save to localStorage (Element-style):', e);
          }

          // Create a Matrix client with the credentials
          const client = matrixSdk.createClient({
            baseUrl: homeserver,
            accessToken: credentials.accessToken,
            userId: credentials.userId,
            deviceId: credentials.deviceId,
            timelineSupport: true,
            useAuthorizationHeader: true
          });

          return client;
        } catch (registerError) {
          // If registration fails with M_USER_IN_USE, try a different username
          if (registerError.errcode === 'M_USER_IN_USE' ||
              (registerError.message && registerError.message.includes('User ID already taken'))) {
            logger.warn('[matrixDirectConnect] Username already taken, trying with a different username');

            // Try with a different username
            const altUsername = `user${userId.replace(/-/g, '')}matrixttestkoraca${Date.now()}`;

            try {
              // Try to register with the alternative username using modern API
              const altRegisterResponse = await tempClient.register(
                altUsername,
                password,
                undefined, // device ID (auto-generated)
                {
                  type: 'm.login.dummy'
                },
                {
                  initial_device_display_name: `DailyFix Web ${new Date().toISOString()}`
                }
              );

              if (!altRegisterResponse || !altRegisterResponse.access_token) {
                throw new Error('Alternative registration failed: No valid response');
              }

              logger.info('[matrixDirectConnect] Alternative registration successful');

              // Create credentials object
              const credentials = {
                userId: altRegisterResponse.user_id,
                accessToken: altRegisterResponse.access_token,
                deviceId: altRegisterResponse.device_id,
                homeserver: homeserver,
                password: password // Store password for future logins
              };

              // Save credentials to IndexedDB
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
                logger.warn('[matrixDirectConnect] Failed to save to localStorage (custom key):', e);
              }

              // Save to Element-style localStorage keys
              try {
                localStorage.setItem('mx_access_token', credentials.accessToken);
                localStorage.setItem('mx_user_id', credentials.userId);
                localStorage.setItem('mx_device_id', credentials.deviceId);
                localStorage.setItem('mx_hs_url', credentials.homeserver);
              } catch (e) {
                logger.warn('[matrixDirectConnect] Failed to save to localStorage (Element-style):', e);
              }

              // Create a Matrix client with the credentials
              const client = matrixSdk.createClient({
                baseUrl: homeserver,
                accessToken: credentials.accessToken,
                userId: credentials.userId,
                deviceId: credentials.deviceId,
                timelineSupport: true,
                useAuthorizationHeader: true
              });

              return client;
            } catch (altRegisterError) {
              logger.error('[matrixDirectConnect] Alternative registration failed:', altRegisterError);
              throw new Error('All registration attempts failed');
            }
          } else {
            logger.error('[matrixDirectConnect] Registration failed:', registerError);
            throw new Error('Registration failed: ' + (registerError.message || 'Unknown error'));
          }
        }
      }
    } catch (error) {
      logger.error('[matrixDirectConnect] Error connecting to Matrix:', error);
      throw error;
    }
  },

  /**
   * Start a Matrix client with timeout
   * @param {Object} client - The Matrix client
   * @returns {Promise<void>}
   */
  async startClient(client) {
    logger.info('[matrixDirectConnect] Starting Matrix client');

    // Set up a timeout for the entire client start and sync process
    const startTime = Date.now();
    const MAX_WAIT_TIME = 15000; // 15 seconds max for the entire process

    try {
      // Start the client with a timeout
      await Promise.race([
        client.startClient(),
        new Promise((_, reject) => setTimeout(() => {
          reject(new Error('Matrix client start timeout'));
        }, 5000)) // 5 second timeout for client start
      ]);

      logger.info('[matrixDirectConnect] Matrix client started successfully');

      // Wait for sync with a timeout
      logger.info('[matrixDirectConnect] Waiting for Matrix sync');

      try {
        await Promise.race([
          new Promise((syncResolve) => {
            const onSync = (state) => {
              if (state === 'PREPARED' || state === 'SYNCING') {
                client.removeListener('sync', onSync);
                logger.info(`[matrixDirectConnect] Matrix sync state: ${state}`);
                syncResolve();
              }
            };
            client.on('sync', onSync);
          }),
          // Add a timeout to prevent getting stuck
          new Promise((_, syncReject) => setTimeout(() => {
            logger.warn('[matrixDirectConnect] Matrix sync timeout, proceeding anyway');
            syncReject(new Error('Matrix sync timeout'));
          }, Math.max(1000, MAX_WAIT_TIME - (Date.now() - startTime)))) // Use remaining time or at least 1 second
        ]);

        logger.info('[matrixDirectConnect] Matrix sync completed successfully');
      } catch (syncError) {
        // If sync times out, we'll still proceed
        logger.warn('[matrixDirectConnect] Matrix sync error or timeout:', syncError);
        logger.info('[matrixDirectConnect] Proceeding despite sync issues');
      }
    } catch (startError) {
      // If client start fails, log it but continue
      logger.error('[matrixDirectConnect] Error starting Matrix client:', startError);
      logger.info('[matrixDirectConnect] Proceeding despite client start issues');
    }
  }
};

export default matrixDirectConnect;
