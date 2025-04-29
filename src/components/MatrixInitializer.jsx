import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { saveToIndexedDB, getFromIndexedDB } from '../utils/indexedDBHelper';
import { setClientInitialized, setSyncState } from '../store/slices/matrixSlice';
import { patchMatrixFetch } from '../utils/matrixFetchUtils';
import matrixClientSingleton from '../utils/matrixClientSingleton';
import { applyCallHandlerFix } from '../utils/matrixCallHandlerFix';
import api from '../utils/api';

// Constants
const MATRIX_CREDENTIALS_KEY = 'matrix_credentials';
const MATRIX_CLIENT_KEY = 'matrix_client';

/**
 * MatrixInitializer component
 * Only initializes the Matrix client when needed for Telegram connection
 * This prevents unnecessary Matrix initialization for users who don't use Telegram
 */
const MatrixInitializer = ({ children, forceInitialize: initialForceInitialize = false }) => {
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const [initializing, setInitializing] = useState(false); // Start as false by default
  const [error, setError] = useState(null);
  const [matrixClient, setMatrixClient] = useState(null);
  const [forceInitialize, setForceInitialize] = useState(initialForceInitialize);



  // Listen for custom initialization events
  useEffect(() => {
    const handleInitializeEvent = (event) => {
      logger.info('[MatrixInitializer] Received custom initialization event', event.detail);

      // If this is a 401 error from Matrix, we need to get fresh credentials
      if (event.detail && event.detail.reason === 'matrix_401_error') {
        logger.info('[MatrixInitializer] Matrix 401 error detected, forcing immediate initialization');

        // Clear any stored Matrix credentials to force a fresh login
        try {
          // Clear localStorage credentials
          const userId = session?.user?.id;
          if (userId) {
            const localStorageKey = `dailyfix_connection_${userId}`;
            const existingData = localStorage.getItem(localStorageKey);
            if (existingData) {
              const parsedData = JSON.parse(existingData);
              if (parsedData.matrix_credentials) {
                // Clear only the Matrix credentials, not the entire object
                delete parsedData.matrix_credentials;
                localStorage.setItem(localStorageKey, JSON.stringify(parsedData));
                logger.info('[MatrixInitializer] Cleared Matrix credentials from localStorage');
              }
            }
          }

          // Clear Matrix SDK credentials
          localStorage.removeItem('mx_access_token');
          localStorage.removeItem('mx_user_id');
          localStorage.removeItem('mx_device_id');
          localStorage.removeItem('mx_hs_url');

          logger.info('[MatrixInitializer] Cleared stored Matrix credentials');
        } catch (error) {
          logger.error('[MatrixInitializer] Error clearing Matrix credentials:', error);
        }
      }

      setForceInitialize(true);

      // Log that we're setting forceInitialize to true
      logger.info('[MatrixInitializer] Setting forceInitialize to true');

      // Immediately start initialization
      logger.info('[MatrixInitializer] Starting immediate initialization');
      setInitializing(true);
    };

    // Add event listener
    window.addEventListener('dailyfix-initialize-matrix', handleInitializeEvent);
    logger.info('[MatrixInitializer] Added event listener for dailyfix-initialize-matrix');

    // Clean up
    return () => {
      window.removeEventListener('dailyfix-initialize-matrix', handleInitializeEvent);
      logger.info('[MatrixInitializer] Removed event listener for dailyfix-initialize-matrix');
    };
  }, [session]);

  // Initialize Matrix client only when needed
  useEffect(() => {
    // Check if we need to initialize Matrix
    const telegramConnected = localStorage.getItem('dailyfix_connection_status') &&
                             JSON.parse(localStorage.getItem('dailyfix_connection_status')).telegram === true;
    const connectingToTelegram = sessionStorage.getItem('connecting_to_telegram') === 'true';
    const selectedPlatform = localStorage.getItem('dailyfix_selected_platform');

    // Skip if not needed
    if (!forceInitialize && !connectingToTelegram && !telegramConnected && selectedPlatform !== 'telegram') {
      logger.info('[MatrixInitializer] Matrix initialization not needed, skipping');
      logger.info(`[MatrixInitializer] forceInitialize=${forceInitialize}, connectingToTelegram=${connectingToTelegram}, telegramConnected=${telegramConnected}, selectedPlatform=${selectedPlatform}`);
      setInitializing(false);
      return;
    }

    logger.info(`[MatrixInitializer] Matrix initialization needed: forceInitialize=${forceInitialize}, connectingToTelegram=${connectingToTelegram}, telegramConnected=${telegramConnected}, selectedPlatform=${selectedPlatform}`);

    logger.info('[MatrixInitializer] Starting Matrix initialization');
    setInitializing(true);

    // Global initialization lock to prevent multiple simultaneous initializations
    if (!window._matrixInitLock) {
      window._matrixInitLock = {
        inProgress: false,
        promise: null,
        timestamp: 0
      };
    }

    // Implement session persistence
    const persistClientState = (client) => {
      try {
        // Save essential client state
        localStorage.setItem('matrix_client_state', JSON.stringify({
          userId: client.getUserId(),
          deviceId: client.getDeviceId(),
          syncState: client.getSyncState(),
          lastActivity: Date.now()
        }));

        // Also save in sessionStorage for tab-specific state
        sessionStorage.setItem('matrix_client_active', 'true');

        logger.info('[MatrixInitializer] Persisted client state to storage');
      } catch (e) {
        logger.warn('[MatrixInitializer] Error persisting client state:', e);
      }
    };

    // Set up periodic state persistence
    let stateInterval = null;

    // Define the Matrix initialization function with lock protection
    const initializeMatrixClient = async () => {
      // Check if we have a valid session
      if (!session?.user?.id) {
        logger.info('[MatrixInitializer] No user session, skipping Matrix initialization');
        setInitializing(false);
        return null;
      }

      // Check if initialization is already in progress
      if (window._matrixInitLock.inProgress) {
        logger.info('[MatrixInitializer] Initialization already in progress, waiting...');
        try {
          await window._matrixInitLock.promise;
          logger.info('[MatrixInitializer] Using existing initialization result');
          return window.matrixClient;
        } catch (error) {
          // If the previous initialization failed more than 10 seconds ago, try again
          if (Date.now() - window._matrixInitLock.timestamp > 10000) {
            logger.warn('[MatrixInitializer] Previous initialization failed, continuing with new attempt');
          } else {
            logger.error('[MatrixInitializer] Recent initialization failed, aborting to prevent rapid retries:', error);
            setError('Matrix initialization failed. Please try again in a few seconds.');
            setInitializing(false);
            return null;
          }
        }
      }

      // Set lock
      window._matrixInitLock.inProgress = true;
      window._matrixInitLock.timestamp = Date.now();

      try {
        logger.info('[MatrixInitializer] Initializing Matrix client for user:', session.user.id);

        // Try multiple sources to get credentials
        let credentials = null;

        // First try to get credentials from IndexedDB
        try {
          const indexedDBData = await getFromIndexedDB(session.user.id);
          logger.info('[MatrixInitializer] IndexedDB data:', JSON.stringify(indexedDBData, null, 2));

          if (indexedDBData && indexedDBData.matrix_credentials) {
            credentials = indexedDBData.matrix_credentials;
            logger.info('[MatrixInitializer] Found credentials in IndexedDB');
          }
        } catch (indexedDBError) {
          logger.warn('[MatrixInitializer] Error getting credentials from IndexedDB:', indexedDBError);
        }

        // If not found in IndexedDB, try localStorage
        if (!credentials || !credentials.accessToken) {
          try {
            // Try to get from our custom localStorage key
            const localStorageKey = `dailyfix_connection_${session.user.id}`;
            const localStorageData = localStorage.getItem(localStorageKey);

            if (localStorageData) {
              const parsedData = JSON.parse(localStorageData);
              if (parsedData.matrix_credentials) {
                credentials = parsedData.matrix_credentials;
                logger.info('[MatrixInitializer] Found credentials in localStorage (custom key)');
              }
            }
          } catch (localStorageError) {
            logger.warn('[MatrixInitializer] Error getting credentials from localStorage:', localStorageError);
          }
        }

        // If still not found, try Element-style localStorage keys
        if (!credentials || !credentials.accessToken) {
          const mx_access_token = localStorage.getItem('mx_access_token');
          const mx_user_id = localStorage.getItem('mx_user_id');
          const mx_device_id = localStorage.getItem('mx_device_id');
          const mx_hs_url = localStorage.getItem('mx_hs_url');

          if (mx_access_token && mx_user_id) {
            credentials = {
              accessToken: mx_access_token,
              userId: mx_user_id,
              deviceId: mx_device_id,
              homeserver: mx_hs_url || 'https://dfix-hsbridge.duckdns.org'
            };
            logger.info('[MatrixInitializer] Found credentials in localStorage (Element-style)');
          }
        }

        // If still not found, fetch from Supabase
        if (!credentials || !credentials.accessToken) {
          logger.info('[MatrixInitializer] No cached credentials, fetching from Supabase');

          try {
            // CRITICAL FIX: Use maybeSingle() instead of single() to prevent 406 errors
            // when no records are found
            const { data, error } = await supabase
              .from('accounts')
              .select('*')
              .eq('user_id', session.user.id)
              .eq('platform', 'matrix')
              .eq('status', 'active')
              .maybeSingle();

            if (error) {
              throw new Error(`Supabase error: ${error.message}`);
            }

            if (!data || !data.credentials) {
              throw new Error('No Matrix credentials found in Supabase');
            }

            credentials = data.credentials;
            logger.info('[MatrixInitializer] Found credentials in Supabase');

            // Save credentials to IndexedDB and localStorage for future use
            await saveToIndexedDB(session.user.id, {
              [MATRIX_CREDENTIALS_KEY]: credentials
            });

            // Also save to our custom localStorage
            const localStorageKey = `dailyfix_connection_${session.user.id}`;
            const existingData = localStorage.getItem(localStorageKey);
            const parsedData = existingData ? JSON.parse(existingData) : {};
            parsedData.matrix_credentials = credentials;
            localStorage.setItem(localStorageKey, JSON.stringify(parsedData));

            logger.info('[MatrixInitializer] Matrix credentials saved to storage');
          } catch (supabaseError) {
            logger.error('[MatrixInitializer] Error fetching Matrix credentials from Supabase:', supabaseError);
            setError('Failed to fetch Matrix credentials: ' + supabaseError.message);
            setInitializing(false);
            return;
          }
        }

        // Final check to ensure we have valid credentials
        if (!credentials || !credentials.accessToken) {
          logger.info('[MatrixInitializer] No valid Matrix credentials found, attempting to get credentials from backend API');

          try {
            // Call the Matrix status API to get or create credentials using the API utility
            const { data, error } = await api.get('/api/v1/matrix/status');

            if (error) {
              throw new Error(`API error: ${error}`);
            }

            if (!data) {
              throw new Error('API returned empty response');
            }

            if (!data.credentials) {
              throw new Error('API response did not contain credentials');
            }

            // Convert backend credentials format to our format
            credentials = {
              userId: data.credentials.userId,
              accessToken: data.credentials.accessToken,
              deviceId: data.credentials.deviceId,
              homeserver: data.credentials.homeserver,
              password: data.credentials.password,
              expires_at: data.credentials.expires_at
            };

            // Save credentials to IndexedDB and localStorage for future use
            await saveToIndexedDB(session.user.id, {
              [MATRIX_CREDENTIALS_KEY]: credentials
            });

            // Also save to our custom localStorage
            const localStorageKey = `dailyfix_connection_${session.user.id}`;
            const existingData = localStorage.getItem(localStorageKey);
            const parsedData = existingData ? JSON.parse(existingData) : {};
            parsedData.matrix_credentials = credentials;
            localStorage.setItem(localStorageKey, JSON.stringify(parsedData));

            logger.info('[MatrixInitializer] Successfully retrieved Matrix credentials from backend API');
          } catch (apiError) {
            logger.error('[MatrixInitializer] Error getting Matrix credentials from API:', apiError);
            setError('Could not get Matrix credentials: ' + apiError.message);
            setInitializing(false);
            return;
          }
        }

        logger.info('[MatrixInitializer] Successfully retrieved Matrix credentials');

        // Log the credentials (without showing the full access token for security)
        const accessTokenPreview = credentials.accessToken ?
          `${credentials.accessToken.substring(0, 5)}...${credentials.accessToken.substring(credentials.accessToken.length - 5)}` :
          'missing';

        logger.info('[MatrixInitializer] Credentials:', {
          userId: credentials.userId,
          deviceId: credentials.deviceId,
          accessToken: accessTokenPreview,
          homeserver: credentials.homeserver
        });

        // Create Matrix client
        const { userId, accessToken, homeserver, deviceId } = credentials;
        const homeserverUrl = homeserver || 'https://dfix-hsbridge.duckdns.org';

        logger.info('[MatrixInitializer] Creating Matrix client with credentials');

        // Double-check that we have a valid access token
        if (!accessToken) {
          throw new Error('Access token is missing or invalid');
        }

        logger.info('[MatrixInitializer] Creating Matrix client with valid credentials');

        // Patch global fetch method to handle Matrix errors gracefully
        patchMatrixFetch();

        // Prepare client configuration
        const clientConfig = {
          homeserver: homeserverUrl,
          userId: userId,
          deviceId: deviceId || `DFIX_WEB_${Date.now()}`,
          accessToken: accessToken
        };

        // Log the client options (without the full access token)
        logger.info('[MatrixInitializer] Client config:', {
          ...clientConfig,
          accessToken: accessToken ? `${accessToken.substring(0, 5)}...${accessToken.substring(accessToken.length - 5)}` : 'missing'
        });

        // Get client from singleton to ensure we only have one instance
        const client = await matrixClientSingleton.getClient(clientConfig, userId);

        // Apply the call handler fix to prevent errors with undefined call handlers
        applyCallHandlerFix(client);

        // Verify the access token is set
        if (!client.getAccessToken()) {
          logger.error('[MatrixInitializer] Access token not set in client, setting it manually');
          client.setAccessToken(accessToken);

          // Verify again
          if (!client.getAccessToken()) {
            throw new Error('Failed to set access token in Matrix client');
          }
        }

        logger.info('[MatrixInitializer] Matrix client created successfully with access token');

        // Set up sync listener before starting client
        client.on('sync', (state, prevState) => {
          logger.info(`[MatrixInitializer] Sync state: ${state} (prev: ${prevState})`);
          dispatch(setSyncState(state));

          // Handle ERROR state specifically
          if (state === 'ERROR') {
            logger.warn('[MatrixInitializer] Matrix client sync error, attempting to recover');

            // If we were previously in a good state, try to restart the client
            if (prevState === 'PREPARED' || prevState === 'SYNCING') {
              logger.info('[MatrixInitializer] Attempting to restart sync after error');

              // Wait a moment before restarting
              setTimeout(() => {
                try {
                  // Force a new sync
                  client.retryImmediately();
                  logger.info('[MatrixInitializer] Forced immediate retry of sync');
                } catch (retryError) {
                  logger.error('[MatrixInitializer] Error retrying sync:', retryError);
                }
              }, 2000);
            }
          }

          // Both PREPARED and SYNCING states indicate the client is ready for use
          if ((state === 'PREPARED' || state === 'SYNCING') &&
              !window.matrixClientInitialized) {
            logger.info(`[MatrixInitializer] Matrix client ready with state: ${state}`);
            dispatch(setClientInitialized(true));

            // Save client to global window object for direct access
            window.matrixClient = client;
            window.matrixClientInitialized = true;

            // Save client info to localStorage (more reliable than IndexedDB for this purpose)
            try {
              localStorage.setItem('matrix_client_initialized', 'true');
              localStorage.setItem('matrix_sync_state', state);
              localStorage.setItem('matrix_last_sync', new Date().toISOString());

              // Also update Element-style localStorage keys
              localStorage.setItem('mx_access_token', client.getAccessToken());
              localStorage.setItem('mx_user_id', client.getUserId());
              localStorage.setItem('mx_device_id', client.getDeviceId());
              localStorage.setItem('mx_hs_url', client.getHomeserverUrl());
            } catch (storageError) {
              logger.error('[MatrixInitializer] Error saving to localStorage:', storageError);
            }

            // Also try to save to IndexedDB, but don't rely on it
            try {
              saveToIndexedDB(session.user.id, {
                [MATRIX_CLIENT_KEY]: {
                  initialized: true,
                  syncState: state,
                  lastSync: new Date().toISOString()
                }
              }).catch(err => {
                logger.warn('[MatrixInitializer] Non-critical IndexedDB save error:', err);
              });
            } catch (dbError) {
              logger.warn('[MatrixInitializer] Non-critical IndexedDB error:', dbError);
            }

            // Force a room list refresh
            setTimeout(() => {
              try {
                // Trigger a room list refresh
                if (window.roomListManager) {
                  const userId = client.getUserId();
                  logger.info('[MatrixInitializer] Forcing room list refresh for user:', userId);
                  window.roomListManager.syncRooms(userId, true);
                }
              } catch (refreshError) {
                logger.error('[MatrixInitializer] Error refreshing room list:', refreshError);
              }
            }, 3000);
          }
        });

        // Element-web doesn't use a separate refresh mechanism for Matrix tokens
        // Instead, it relies on the Matrix SDK to handle token refreshing and re-authentication
        // The SDK will automatically handle 401 errors by attempting to re-authenticate

        // Set up token expiry monitoring (Element-style)
        const setupTokenMonitoring = () => {
          // Element stores the token in the client's internal storage
          // which is already done by the SDK when we create the client
          // We also store it in localStorage in the sync handler above

          // Log token info for debugging
          logger.info('[MatrixInitializer] Token monitoring initialized');

          // Element handles token expiry by catching 401 errors and re-authenticating
          // We'll set up an error handler to detect auth errors
          client.on('Session.logged_out', async () => {
            logger.warn('[MatrixInitializer] Session logged out, attempting to re-authenticate');

            // Instead of showing an alert, we'll try to re-authenticate silently
            try {
              // First, try to refresh the token by re-initializing the client
              logger.info('[MatrixInitializer] Attempting to re-authenticate Matrix client via API');

              // Use the imported API utility
              try {
                // Call the Matrix status API to get fresh credentials
                const { data, error } = await api.get('/api/v1/matrix/status');

                if (error) {
                  throw new Error(`API error: ${error}`);
                }

                if (!data || !data.credentials) {
                  throw new Error('API response did not contain credentials');
                }

                // Update the client with the new credentials
                client.setAccessToken(data.credentials.accessToken);

                // Store the credentials for future use
                try {
                  const userId = session?.user?.id;
                  if (userId) {
                    const localStorageKey = `dailyfix_connection_${userId}`;
                    const existingData = localStorage.getItem(localStorageKey);
                    const parsedData = existingData ? JSON.parse(existingData) : {};
                    parsedData.matrix_credentials = data.credentials;
                    localStorage.setItem(localStorageKey, JSON.stringify(parsedData));
                    logger.info('[MatrixInitializer] Stored new credentials in localStorage');
                  }
                } catch (storageError) {
                  logger.warn('[MatrixInitializer] Failed to store credentials in localStorage:', storageError);
                }

                logger.info('[MatrixInitializer] Successfully refreshed Matrix token via API');
              } catch (apiError) {
                logger.error('[MatrixInitializer] API token refresh failed:', apiError);

                // If API refresh fails, trigger a full re-initialization
                const event = new CustomEvent('dailyfix-initialize-matrix', {
                  detail: { reason: 'session_logged_out' }
                });
                window.dispatchEvent(event);
              }
            } catch (error) {
              logger.error('[MatrixInitializer] Error during Matrix re-authentication:', error);
              // Don't show any UI notification - we'll handle this silently
            }
          });

          // Element also handles token refresh by periodically checking the token validity
          // This is done by making a simple API call to the homeserver
          const checkTokenValidity = async () => {
            try {
              // Make a simple API call to check if the token is still valid
              await client.getProfileInfo(userId);
              logger.info('[MatrixInitializer] Token is still valid');

              // Schedule next check in 30 minutes
              setTimeout(checkTokenValidity, 30 * 60 * 1000);
            } catch (error) {
              if (error.httpStatus === 401) {
                logger.warn('[MatrixInitializer] Token is no longer valid, session may be expired');

                // Instead of showing an alert, we'll try to re-authenticate silently
                try {
                  // First, try to refresh the token via API
                  logger.info('[MatrixInitializer] Attempting to re-authenticate Matrix client via API');

                  try {
                    // Call the Matrix status API to get fresh credentials
                    const { data, error } = await api.get('/api/v1/matrix/status');

                    if (error) {
                      throw new Error(`API error: ${error}`);
                    }

                    if (!data || !data.credentials) {
                      throw new Error('API response did not contain credentials');
                    }

                    // Update the client with the new credentials
                    client.setAccessToken(data.credentials.accessToken);

                    // Store the credentials for future use
                    try {
                      const userId = session?.user?.id;
                      if (userId) {
                        const localStorageKey = `dailyfix_connection_${userId}`;
                        const existingData = localStorage.getItem(localStorageKey);
                        const parsedData = existingData ? JSON.parse(existingData) : {};
                        parsedData.matrix_credentials = data.credentials;
                        localStorage.setItem(localStorageKey, JSON.stringify(parsedData));
                        logger.info('[MatrixInitializer] Stored new credentials in localStorage');
                      }
                    } catch (storageError) {
                      logger.warn('[MatrixInitializer] Failed to store credentials in localStorage:', storageError);
                    }

                    logger.info('[MatrixInitializer] Successfully refreshed Matrix token via API');

                    // Schedule next check in 30 minutes
                    setTimeout(checkTokenValidity, 30 * 60 * 1000);
                  } catch (apiError) {
                    logger.error('[MatrixInitializer] API token refresh failed:', apiError);

                    // If API refresh fails, trigger a full re-initialization
                    const event = new CustomEvent('dailyfix-initialize-matrix', {
                      detail: { reason: 'token_invalid' }
                    });
                    window.dispatchEvent(event);
                  }
                } catch (reAuthError) {
                  logger.error('[MatrixInitializer] Error during Matrix re-authentication:', reAuthError);
                  // Don't show any UI notification - we'll handle this silently
                }
              } else {
                logger.error('[MatrixInitializer] Error checking token validity:', error);
                // Schedule next check in 5 minutes if there was a non-auth error
                setTimeout(checkTokenValidity, 5 * 60 * 1000);
              }
            }
          };

          // CRITICAL FIX: Start checking token validity much sooner (after 5 minutes)
          // and also check immediately to catch any existing token issues
          checkTokenValidity();
          setTimeout(checkTokenValidity, 5 * 60 * 1000);
        };

        // Set up token monitoring
        setupTokenMonitoring();

        // CRITICAL FIX: Disable call event handler to prevent "Cannot read properties of undefined (reading 'start')" error
        try {
          // Disable the call event handler before starting the client
          if (client.callEventHandler) {
            logger.info('[MatrixInitializer] Disabling call event handler to prevent errors');
            client.callEventHandler = null;
          }
        } catch (callHandlerError) {
          logger.warn('[MatrixInitializer] Error handling call event handler:', callHandlerError);
        }

        // Start client
        logger.info('[MatrixInitializer] Starting Matrix client');
        await client.startClient({
          initialSyncLimit: 20,
          includeArchivedRooms: true,
          lazyLoadMembers: true,
          disableCallEventHandler: true // Add this option to disable call handling
        });

        // Set client in state
        setMatrixClient(client);

        // Credentials are stored in localStorage in the sync handler
        // and also in the token monitoring setup

        // Also expose client globally for direct access (Element does this)
        window.matrixClient = client;

        // Set up periodic state persistence
        stateInterval = setInterval(() => {
          if (client) {
            persistClientState(client);
          }
        }, 30000); // Every 30 seconds

        // Initial persistence
        persistClientState(client);

        logger.info('[MatrixInitializer] Matrix client started successfully');

        // Release the lock
        window._matrixInitLock.inProgress = false;

        return client;
      } catch (err) {
        logger.error('[MatrixInitializer] Error initializing Matrix client:', err);
        setError(err.message || 'Failed to initialize Matrix client');

        // Release the lock on error
        window._matrixInitLock.inProgress = false;

        throw err;
      } finally {
        setInitializing(false);
      }
    };

    // Start initialization
    initializeMatrixClient().catch(err => {
      logger.error('[MatrixInitializer] Unhandled error during initialization:', err);
    });

    // Cleanup on unmount
    return () => {
      // Clear the state persistence interval
      if (stateInterval) {
        clearInterval(stateInterval);
        stateInterval = null;
      }

      // Properly clean up Matrix client
      const cleanupMatrixClient = () => {
        if (matrixClient) {
          logger.info('[MatrixInitializer] Stopping Matrix client');
          try {
            // Remove all listeners first to prevent callback errors during cleanup
            matrixClient.removeAllListeners();

            // Stop the client
            if (matrixClient.clientRunning) {
              matrixClient.stopClient();
            }

            // Clear state
            setMatrixClient(null);

            // Clear global reference
            if (window.matrixClient === matrixClient) {
              window.matrixClient = null;
            }

            // Clear any session flags
            sessionStorage.removeItem('connecting_to_telegram');

            // Clear the initialization lock if it's ours
            if (window._matrixInitLock && window._matrixInitLock.inProgress) {
              window._matrixInitLock.inProgress = false;
            }

            logger.info('[MatrixInitializer] Matrix client stopped successfully');
          } catch (e) {
            logger.error('[MatrixInitializer] Error stopping Matrix client:', e);
          }
        }
      };

      // Execute cleanup
      cleanupMatrixClient();
    };
  }, [session, dispatch, forceInitialize, matrixClient]);

  // Make client available to components that need it
  useEffect(() => {
    if (matrixClient) {
      // Update the useMatrixClient hook's context
      if (window.MatrixClientContext) {
        window.MatrixClientContext.client = matrixClient;
      }
    }
  }, [matrixClient]);

  // Create a global MatrixClientContext for direct access
  if (!window.MatrixClientContext) {
    window.MatrixClientContext = {
      getClient: () => window.matrixClient
    };
  }

  // Add global error handler for Matrix-related errors if not already installed
  useEffect(() => {
    if (!window._matrixErrorHandlerInstalled) {
      const handleGlobalError = (event) => {
        // Check if error is Matrix-related
        if (event.error &&
            (event.error.name && event.error.name.includes('Matrix') ||
             event.error.message && (
               event.error.message.includes('matrix') ||
               event.error.message.includes('sync') ||
               event.error.message.includes('token')
             ))) {

          logger.warn('[MatrixInitializer] Caught Matrix-related error:', event.error);

          // Prevent the error from showing in console
          event.preventDefault();

          // Try to recover the client if possible
          if (window.matrixClient && window.matrixClient.getUserId()) {
            // Log the user ID for debugging
            logger.info('[MatrixInitializer] Attempting recovery for user:',
              window.matrixClient.getUserId().split(':')[0].substring(1));

            // Attempt recovery by forcing a sync
            try {
              if (window.matrixClient.clientRunning) {
                window.matrixClient.retryImmediately();
                logger.info('[MatrixInitializer] Forced sync after error');
              } else {
                window.matrixClient.startClient().catch(e => {
                  logger.error('[MatrixInitializer] Error restarting client after error:', e);
                });
              }
            } catch (recoveryError) {
              logger.error('[MatrixInitializer] Error during recovery attempt:', recoveryError);
            }
          }

          return true;
        }
      };

      window.addEventListener('error', handleGlobalError);
      window._matrixErrorHandlerInstalled = true;

      return () => {
        window.removeEventListener('error', handleGlobalError);
      };
    }
  }, []);

  // Show toast notification for errors instead of modal
  useEffect(() => {
    if (error && !initializing) {
      // Import toast dynamically to avoid circular dependencies
      import('react-hot-toast').then(({ toast }) => {
        // Create a custom toast with retry button
        toast.custom(
          (t) => (
            <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-neutral-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
              <div className="flex-1 w-0 p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0 pt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-white">Background sync issue</p>
                    <p className="mt-1 text-sm text-gray-300">
                      We&apos;re having trouble syncing your messages in the background. Some features may be limited.
                    </p>
                  </div>
                </div>
              </div>
              {/* <div className="flex border-l border-gray-700">
                <button
                  onClick={() => {
                    toast.dismiss(t.id);
                    window.location.reload();
                  }}
                  className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-purple-500 hover:text-purple-400 focus:outline-none"
                >
                  Refresh
                </button>
              </div> */}
            </div>
          ),
          { duration: 1000, position: 'bottom-right' }
        );
      });
    }
  }, [error, initializing]);

  // Show a subtle loading indicator instead of a modal
  return (
    <div className="matrix-initializer">
      {initializing && (
        <div className="fixed bottom-4 right-4 bg-neutral-800 p-3 rounded-lg shadow-lg z-10 flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          <p className="text-white text-sm">Syncing messages...</p>
        </div>
      )}

      {children}
    </div>
  );
};

export default MatrixInitializer;
