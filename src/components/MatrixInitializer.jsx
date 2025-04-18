import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import * as matrixSdk from 'matrix-js-sdk';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { saveToIndexedDB, getFromIndexedDB } from '../utils/indexedDBHelper';
import { setClientInitialized, setSyncState } from '../store/slices/matrixSlice';

// Constants
const MATRIX_CREDENTIALS_KEY = 'matrix_credentials';
const MATRIX_CLIENT_KEY = 'matrix_client';

/**
 * MatrixInitializer component
 * Directly initializes the Matrix client following Element's approach
 */
const MatrixInitializer = ({ children }) => {
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [matrixClient, setMatrixClient] = useState(null);

  // Initialize Matrix client
  useEffect(() => {
    const initializeMatrixClient = async () => {
      if (!session?.user?.id) {
        logger.info('[MatrixInitializer] No user session, skipping Matrix initialization');
        setInitializing(false);
        return;
      }

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
            const { data, error } = await supabase
              .from('accounts')
              .select('*')
              .eq('user_id', session.user.id)
              .eq('platform', 'matrix')
              .eq('status', 'active')
              .single();

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
          logger.error('[MatrixInitializer] Could not find valid Matrix credentials in any storage');
          setError('No valid Matrix credentials found');
          setInitializing(false);
          return;
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

        // Create Matrix client directly (Element-web style)
        const clientOpts = {
          baseUrl: homeserverUrl,
          userId: userId,
          deviceId: deviceId || `DFIX_WEB_${Date.now()}`,
          accessToken: accessToken,
          timelineSupport: true,
          store: new matrixSdk.MemoryStore({ localStorage: window.localStorage }),
          verificationMethods: ['m.sas.v1'],
          unstableClientRelationAggregation: true,
          useAuthorizationHeader: true
        };

        // Log the client options (without the full access token)
        logger.info('[MatrixInitializer] Client options:', {
          ...clientOpts,
          accessToken: accessToken ? `${accessToken.substring(0, 5)}...${accessToken.substring(accessToken.length - 5)}` : 'missing'
        });

        // Create the client
        const client = matrixSdk.createClient(clientOpts);

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
          client.on('Session.logged_out', () => {
            logger.warn('[MatrixInitializer] Session logged out, attempting to re-authenticate');
            // In a real implementation, we would trigger a re-authentication flow here
            // For now, we'll just notify the user
            alert('Your session has expired. Please refresh the page to log in again.');
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
                // In a real implementation, we would trigger a re-authentication flow here
                // For now, we'll just notify the user
                alert('Your session has expired. Please refresh the page to log in again.');
              } else {
                logger.error('[MatrixInitializer] Error checking token validity:', error);
                // Schedule next check in 5 minutes if there was a non-auth error
                setTimeout(checkTokenValidity, 5 * 60 * 1000);
              }
            }
          };

          // Start checking token validity after 30 minutes
          setTimeout(checkTokenValidity, 30 * 60 * 1000);
        };

        // Set up token monitoring
        setupTokenMonitoring();

        // Start client
        logger.info('[MatrixInitializer] Starting Matrix client');
        await client.startClient({
          initialSyncLimit: 20,
          includeArchivedRooms: true,
          lazyLoadMembers: true
        });

        // Set client in state
        setMatrixClient(client);

        // Credentials are stored in localStorage in the sync handler
        // and also in the token monitoring setup

        // Also expose client globally for direct access (Element does this)
        window.matrixClient = client;

        logger.info('[MatrixInitializer] Matrix client started successfully');
      } catch (err) {
        logger.error('[MatrixInitializer] Error initializing Matrix client:', err);
        setError(err.message || 'Failed to initialize Matrix client');
      } finally {
        setInitializing(false);
      }
    };

    initializeMatrixClient();

    // Cleanup on unmount
    return () => {
      if (matrixClient) {
        logger.info('[MatrixInitializer] Stopping Matrix client');
        matrixClient.removeAllListeners();
        matrixClient.stopClient();
        setMatrixClient(null);
        window.matrixClient = null;
      }
    };
  }, [session, dispatch]);

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
                      We're having trouble syncing your messages in the background. Some features may be limited.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex border-l border-gray-700">
                <button
                  onClick={() => {
                    toast.dismiss(t.id);
                    window.location.reload();
                  }}
                  className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-purple-500 hover:text-purple-400 focus:outline-none"
                >
                  Refresh
                </button>
              </div>
            </div>
          ),
          { duration: 10000, position: 'bottom-right' }
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
