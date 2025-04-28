import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaWhatsapp, FaLock, FaCheck } from 'react-icons/fa';
import { FaTelegram } from 'react-icons/fa6';
import WhatsAppBridgeSetup from './WhatsAppBridgeSetup';
import TelegramConnection from './TelegramConnection';
import logger from '../utils/logger';
import api from '../utils/api';
import tokenManager from '../utils/tokenManager';
import { supabase } from '../utils/supabase';
import { useDispatch, useSelector } from 'react-redux';
import { setWhatsappConnected, updateAccounts } from '../store/slices/onboardingSlice';
import { fetchContacts } from '../store/slices/contactSlice';
import { toast } from 'react-toastify';
import { saveToIndexedDB, getFromIndexedDB } from '../utils/indexedDBHelper';
import matrixTokenManager from '../utils/matrixTokenManager';
import matrixTokenRefresher from '../utils/matrixTokenRefresher';
import '../styles/platformButtons.css';

// Constants
const MATRIX_CREDENTIALS_KEY = 'matrix_credentials';

const PlatformConnectionModal = ({ isOpen, onClose, onConnectionComplete }) => {
  const dispatch = useDispatch();
  const { accounts, whatsappConnected } = useSelector(state => state.onboarding);
  const { session } = useSelector(state => state.auth);
  const [step, setStep] = useState('intro'); // intro, matrix-setup, whatsapp-setup, telegram-setup, success
  const [loading, setLoading] = useState(false); // Add loading state for UI feedback
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);

  // CRITICAL FIX: Check multiple sources for connected platforms
  useEffect(() => {
    const checkConnectedPlatforms = async () => {
      if (!session?.user?.id) return;

      const userId = session.user.id;
      const platformStatus = { whatsapp: false, telegram: false };

      // 1. Check accounts array from Redux
      accounts.forEach(account => {
        if (account.platform === 'whatsapp' && (account.status === 'active' || account.status === 'pending')) {
          platformStatus.whatsapp = true;
        }
        if (account.platform === 'telegram' && (account.status === 'active' || account.status === 'pending')) {
          platformStatus.telegram = true;
        }
      });

      // 2. Check whatsappConnected from Redux
      if (whatsappConnected) {
        platformStatus.whatsapp = true;
      }

      // 3. Check localStorage connection_status
      try {
        const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
        if (connectionStatus.whatsapp === true) platformStatus.whatsapp = true;
        if (connectionStatus.telegram === true) platformStatus.telegram = true;
      } catch (error) {
        logger.error('[PlatformConnectionModal] Error checking localStorage connection_status:', error);
      }

      // 4. Check dailyfix_auth in localStorage
      try {
        const authDataStr = localStorage.getItem('dailyfix_auth');
        if (authDataStr) {
          const authData = JSON.parse(authDataStr);
          if (authData.whatsappConnected === true) platformStatus.whatsapp = true;
          if (authData.telegramConnected === true) platformStatus.telegram = true;
        }
      } catch (error) {
        logger.error('[PlatformConnectionModal] Error checking dailyfix_auth:', error);
      }

      // 5. Check connected_platforms in localStorage
      try {
        const connectedPlatformsStr = localStorage.getItem('connected_platforms');
        if (connectedPlatformsStr) {
          const platforms = JSON.parse(connectedPlatformsStr);
          if (Array.isArray(platforms)) {
            if (platforms.includes('whatsapp')) platformStatus.whatsapp = true;
            if (platforms.includes('telegram')) platformStatus.telegram = true;
          }
        }
      } catch (error) {
        logger.error('[PlatformConnectionModal] Error checking connected_platforms:', error);
      }

      // 6. Check IndexedDB for WhatsApp
      try {
        const isWhatsAppConnectedDB = await import('../utils/connectionStorageDB').then(m => m.isWhatsAppConnectedDB);
        const whatsappConnectedInDB = await isWhatsAppConnectedDB(userId);
        if (whatsappConnectedInDB) platformStatus.whatsapp = true;
      } catch (error) {
        logger.error('[PlatformConnectionModal] Error checking WhatsApp in IndexedDB:', error);
      }

      // 7. Check Telegram using helper
      try {
        const isTelegramConnected = await import('../utils/telegramHelper').then(m => m.isTelegramConnected);
        const telegramConnectedHelper = await isTelegramConnected(userId);
        if (telegramConnectedHelper) platformStatus.telegram = true;
      } catch (error) {
        logger.error('[PlatformConnectionModal] Error checking Telegram with helper:', error);
      }

      // Update connected platforms state
      const connected = [];
      if (platformStatus.whatsapp) connected.push('whatsapp');
      if (platformStatus.telegram) connected.push('telegram');
      setConnectedPlatforms(connected);

      logger.info('[PlatformConnectionModal] Connected platforms:', connected);
    };

    if (isOpen) {
      checkConnectedPlatforms();
    }
  }, [isOpen, accounts, whatsappConnected, session]);

  // Enhanced onClose handler that cleans up Matrix resources
  const handleClose = () => {
    // Clear any Telegram connection flags
    sessionStorage.removeItem('connecting_to_telegram');

    // If we have a Matrix client and we're not keeping it (not connected to Telegram)
    if (window.matrixClient && step !== 'success') {
      logger.info('[PlatformConnectionModal] Cleaning up Matrix client on close');
      try {
        // Remove all listeners first
        window.matrixClient.removeAllListeners();

        // Stop the client if it's running
        if (window.matrixClient.clientRunning) {
          window.matrixClient.stopClient();
        }

        // Clear global reference
        window.matrixClient = null;
      } catch (e) {
        logger.error('[PlatformConnectionModal] Error cleaning up Matrix client:', e);
      }
    }

    // Call the original onClose
    onClose();
  }

  // Note: We're using a direct connect approach with a consistent username and password
  // This ensures we can always connect to the same account

  // Original initializeMatrix function for WhatsApp (using backend API)
  // This is called directly when the user clicks the WhatsApp button in the UI
  // It uses the backend API to initialize Matrix and then transitions to the WhatsApp setup step
  const initializeMatrix = async () => {
    setLoading(true);
    // Show loading toast
    toast.loading('Initializing connection...', { id: 'whatsapp-init' });

    // Set up a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      logger.warn('[PlatformConnectionModal] Matrix initialization timeout');
      toast.error('Connection attempt timed out. Please try again.', { id: 'whatsapp-init' });
      setLoading(false);
    }, 30000); // 30 seconds timeout

    try {
      logger.info('[PlatformConnectionModal] Initializing Matrix connection');

      // CRITICAL FIX: Implement a robust token validation and refresh mechanism
      let validToken = null;

      try {
        // First try to get a valid token without forcing refresh
        validToken = await tokenManager.getValidToken(undefined, false);

        // If that fails, try with force refresh
        if (!validToken) {
          logger.info('[PlatformConnectionModal] Initial token validation failed, forcing refresh');
          validToken = await tokenManager.getValidToken(undefined, true);
        }

        // If we still don't have a valid token, try one more approach
        if (!validToken) {
          logger.info('[PlatformConnectionModal] Token refresh failed, trying session recovery');

          // Try to get the current session directly from Supabase
          const { data } = await supabase.auth.getSession();
          if (data?.session?.access_token) {
            validToken = data.session.access_token;

            // Store the token for future use
            localStorage.setItem('access_token', validToken);
            if (data.session.refresh_token) {
              localStorage.setItem('refresh_token', data.session.refresh_token);
            }
            if (data.session.expires_at) {
              localStorage.setItem('session_expiry', data.session.expires_at);
            }

            logger.info('[PlatformConnectionModal] Successfully recovered session');
          }
        }

        // If we still don't have a valid token, show a user-friendly error
        if (!validToken) {
          throw new Error('Unable to obtain a valid authentication token');
        }
      } catch (tokenError) {
        logger.error('[PlatformConnectionModal] Token validation failed:', tokenError);
        toast.error('Authentication error. Please try refreshing the page or log in again.', { id: 'whatsapp-init' });
        setLoading(false);
        return;
      }

      // Now make the API request with our valid token
      try {
        // Ensure the token is set in the API headers
        api.defaults.headers.common['Authorization'] = `Bearer ${validToken}`;

        const response = await api.post('/api/v1/matrix/auto-initialize');

        if (response.data.status === 'success') {
          logger.info('[PlatformConnectionModal] Matrix initialized successfully');
          toast.success('Connection initialized successfully', { id: 'whatsapp-init' });
          // Clear the timeout
          clearTimeout(timeoutId);
          // Proceed to WhatsApp setup
          setStep('whatsapp-setup');
        } else {
          throw new Error('Failed to initialize Matrix');
        }
      } catch (apiError) {
        logger.error('[PlatformConnectionModal] API request failed:', apiError);

        // Clear the timeout
        clearTimeout(timeoutId);

        // Show appropriate error message based on error type
        if (apiError.response && apiError.response.status === 500) {
          toast.error('The Matrix service is currently unavailable. Please try again later.', { id: 'whatsapp-init' });
        } else if (apiError.response && apiError.response.status === 401) {
          // Show a user-friendly authentication error
          toast.error('Your session has expired. Please refresh the page and try again.', { id: 'whatsapp-init' });

          // Don't redirect, just show the error
        } else {
          toast.error('Failed to initialize Matrix. Please try again.', { id: 'whatsapp-init' });
        }
      }
    } catch (error) {
      logger.error('[PlatformConnectionModal] Unexpected error:', error);
      toast.error('An unexpected error occurred. Please try again.', { id: 'whatsapp-init' });

      // Clear the timeout
      clearTimeout(timeoutId);
    } finally {
      setLoading(false);
    }
  };

  // Alternative Matrix initialization for WhatsApp (used only for pre-selection flow)
  // This is called only when window.platformToConnect === 'whatsapp' is true (from useEffect)
  // It provides a more comprehensive initialization with fallbacks and direct client creation
  // DO NOT REMOVE: This function is needed for the pre-selection flow
  const initializeMatrixForWhatsApp = useCallback(async () => {
    return new Promise(async (resolve, reject) => {
      try {
        // If Matrix client is already initialized, just return
        if (window.matrixClient) {
          logger.info('[PlatformConnectionModal] Matrix client already initialized');
          setStep('whatsapp-setup');
          resolve();
          return;
        }

        logger.info('[PlatformConnectionModal] Initializing Matrix connection for WhatsApp');
        toast.loading('Initializing connection...', { id: 'matrix-init' });

        // For WhatsApp, we need to initialize through the API
        try {
          const response = await api.post('/api/v1/matrix/auto-initialize');

          if (response.data.status === 'success') {
            logger.info('[PlatformConnectionModal] Matrix initialized successfully through API');
          } else {
            throw new Error('Failed to initialize Matrix through API');
          }
        } catch (apiError) {
          logger.error('[PlatformConnectionModal] Error initializing through API for WhatsApp:', apiError);
          toast.error('Failed to initialize connection. Please try again.', { id: 'matrix-init' });
          reject(apiError);
          return;
        }

        // Wait a bit for the client to be available
        let attempts = 0;
        const maxAttempts = 10; // 5 seconds

        while (!window.matrixClient && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 500));
          attempts++;

          if (attempts % 4 === 0) {
            logger.info(`[PlatformConnectionModal] Waiting for Matrix client... (${attempts}/${maxAttempts})`);
          }
        }

        // If client is available, we're done
        if (window.matrixClient) {
          logger.info('[PlatformConnectionModal] Matrix client now available');
          toast.success('Connection initialized', { id: 'matrix-init' });

          // For WhatsApp, proceed to WhatsApp setup
          if (window.platformToConnect === 'whatsapp') {
            setStep('whatsapp-setup');
          }

          resolve();
          return;
        }

        // If client is still not available, initialize directly
        logger.info('[PlatformConnectionModal] Matrix client not available, initializing directly');

        // Import Matrix SDK
        const matrixSdk = await import('matrix-js-sdk');

        // Use the session from component scope
        if (!session?.user?.id) {
          throw new Error('No user session available');
        }

        // Try to get credentials from multiple sources
        let credentials = null;

        // First try to get credentials from IndexedDB
        try {
          const indexedDBData = await getFromIndexedDB(session.user.id);
          logger.info('[PlatformConnectionModal] IndexedDB data:', JSON.stringify(indexedDBData, null, 2));

          if (indexedDBData && indexedDBData[MATRIX_CREDENTIALS_KEY]) {
            credentials = indexedDBData[MATRIX_CREDENTIALS_KEY];
            logger.info('[PlatformConnectionModal] Found credentials in IndexedDB');
          }
        } catch (indexedDBError) {
          logger.warn('[PlatformConnectionModal] Error getting credentials from IndexedDB:', indexedDBError);
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
                logger.info('[PlatformConnectionModal] Found credentials in localStorage (custom key)');
              }
            }
          } catch (localStorageError) {
            logger.warn('[PlatformConnectionModal] Error getting credentials from localStorage:', localStorageError);
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
            logger.info('[PlatformConnectionModal] Found credentials in localStorage (Element-style)');
          }
        }

        // If still not found, fetch from API
        if (!credentials || !credentials.accessToken) {
          try {
            logger.info('[PlatformConnectionModal] No cached credentials, fetching from API');

            // Use the API endpoint to get accounts
            const response = await api.get('/api/v1/users/accounts');

            // Log the response for debugging
            logger.info('[PlatformConnectionModal] API response:', response.data);

            if (!response.data || response.data.status !== 'success') {
              throw new Error('Failed to fetch accounts from API');
            }

            // Find the Matrix account
            const matrixAccount = response.data.data.find(account =>
              account.platform === 'matrix' && account.status === 'active'
            );

            // Check if we found a Matrix account with credentials
            if (!matrixAccount || !matrixAccount.credentials) {
              throw new Error('No Matrix credentials found');
            }

            // Use the Matrix account credentials
            credentials = matrixAccount.credentials;
            logger.info('[PlatformConnectionModal] Found credentials from API');

            // Save credentials to IndexedDB for future use
            await saveToIndexedDB(session.user.id, {
              [MATRIX_CREDENTIALS_KEY]: credentials
            });

            // Also save to our custom localStorage
            const localStorageKey = `dailyfix_connection_${session.user.id}`;
            const existingData = localStorage.getItem(localStorageKey);
            const parsedData = existingData ? JSON.parse(existingData) : {};
            parsedData.matrix_credentials = credentials;
            localStorage.setItem(localStorageKey, JSON.stringify(parsedData));

            logger.info('[PlatformConnectionModal] Matrix credentials saved to storage');
          } catch (supabaseError) {
            logger.error('[PlatformConnectionModal] Error fetching Matrix credentials from Supabase:', supabaseError);
          }
        }

        // Final check to ensure we have valid credentials
        if (!credentials || !credentials.accessToken) {
          logger.info('[PlatformConnectionModal] No valid Matrix credentials found, registering new account');

          try {
            logger.info('[PlatformConnectionModal] Starting Matrix account registration for user:', session.user.id);

            // Instead of client-side registration, use the backend API
            const { data, error } = await api.post('/api/v1/matrix/auto-initialize');

            if (error) {
              throw new Error(`API error: ${error}`);
            }

            if (!data || data.status !== 'active' || !data.credentials) {
              throw new Error('Failed to initialize Matrix account through API');
            }

            // Use the credentials from the API response
            credentials = data.credentials;

            if (!credentials || !credentials.accessToken) {
              throw new Error('API returned invalid credentials');
            }

            logger.info('[PlatformConnectionModal] Successfully registered new Matrix account through API');
          } catch (registrationError) {
            logger.error('[PlatformConnectionModal] Error registering Matrix account:', registrationError);
            toast.error('Failed to register Matrix account. Please try again.', { id: 'telegram-init' });
            throw new Error('Could not register Matrix account: ' + registrationError.message);
          }
        }

        // Create Matrix client
        const { userId, accessToken, homeserver, deviceId } = credentials;
        const homeserverUrl = homeserver || 'https://dfix-hsbridge.duckdns.org';

        // Create Matrix client directly (Element-web style)
        const clientOpts = {
          baseUrl: homeserverUrl,
          userId: userId,
          deviceId: deviceId || `DFIX_WEB_${Date.now()}`,
          accessToken: accessToken,
          timelineSupport: true,
          store: new matrixSdk.MemoryStore({ localStorage: window.localStorage }),
          useAuthorizationHeader: true
        };

        logger.info('[PlatformConnectionModal] Creating new Matrix client');
        const client = matrixSdk.createClient(clientOpts);

        // Set up sync listener
        client.on('sync', (state) => {
          logger.info(`[PlatformConnectionModal] Matrix sync state: ${state}`);

          // Save client info to localStorage
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
            logger.error('[PlatformConnectionModal] Error saving to localStorage:', storageError);
          }
        });

        // Start client
        logger.info('[PlatformConnectionModal] Starting Matrix client');
        await client.startClient();

        // Set client globally
        window.matrixClient = client;

        logger.info('[PlatformConnectionModal] Matrix client initialized successfully');
        toast.success('Connection initialized', { id: 'matrix-init' });

        // For WhatsApp, proceed to WhatsApp setup
        if (window.platformToConnect === 'whatsapp') {
          setStep('whatsapp-setup');
        }

        resolve();
      } catch (error) {
        logger.error('[PlatformConnectionModal] Error initializing Matrix:', error);

        // Show appropriate error message
        if (error.response && error.response.status === 401) {
          toast.error('Your session has expired. Please log in again.', { id: 'matrix-init' });
          // Redirect to login after a short delay
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
        } else {
          toast.error('Failed to initialize Matrix. Please try again.', { id: 'matrix-init' });
        }

        reject(error);
      }
    });
  }, [session.user.id]);

  // Handle WhatsApp connection completion
  const handleWhatsAppComplete = () => {
    logger.info('[PlatformConnectionModal] WhatsApp connection completed');
    dispatch(setWhatsappConnected(true));
    setStep('success');
  };

  // Handle final completion
  const handleComplete = () => {
    logger.info('[PlatformConnectionModal] Platform connection process completed');

    // CRITICAL FIX: Dispatch action to fetch contacts
    dispatch(fetchContacts());

    // Call the onConnectionComplete callback if provided
    if (onConnectionComplete) {
      onConnectionComplete();
    }

    // Close the modal using our enhanced close handler
    handleClose();

    // Force a page reload to ensure the dashboard shows the connected platform
    // This is a temporary fix until we can properly handle the state updates
    // window.location.reload();
  };

  // Handle Telegram connection completion
  const handleTelegramComplete = (telegramAccount) => {
    logger.info('[PlatformConnectionModal] Telegram connection completed');

    // Update accounts in Redux store
    dispatch(updateAccounts([...accounts, telegramAccount]));

    setStep('success');
  };

  // Initialize Matrix for Telegram
  const initializeMatrixForTelegram = useCallback((telegramLoading) => {
    // Set a flag to indicate we're connecting to Telegram
    // This is critical for the token refresh mechanism
    sessionStorage.setItem('connecting_to_telegram', 'true');
    logger.info('[PlatformConnectionModal] Set connecting_to_telegram flag for Matrix initialization');

    // Get Matrix credentials from matrixTokenManager
    // This will check localStorage first, then IndexedDB, and finally call the backend API
    return matrixTokenManager.getCredentials(session.user.id)
      .then(async (credentials) => {
        // If credentials were found, use them
        if (credentials && credentials.accessToken) {
          logger.info('[PlatformConnectionModal] Using credentials from matrixTokenManager');
          return initializeWithCredentials(credentials);
        } else {
          // This should not happen since matrixTokenManager now calls the backend API
          // which should always return credentials, but handle it just in case
          logger.error('[PlatformConnectionModal] No credentials returned from matrixTokenManager');
          throw new Error('Failed to get Matrix credentials');
        }
      })
      .catch(error => {
        logger.error('[PlatformConnectionModal] Error initializing Matrix for Telegram:', error);
        toast.error('Failed to prepare Telegram connection. Please try again.', { id: 'telegram-init' });

        // Clear loading state
        setLoading(false);
        if (telegramLoading) telegramLoading.classList.remove('loading');

        // Clear the connecting flag on error to allow retrying
        sessionStorage.removeItem('connecting_to_telegram');
      });

    // Helper function to initialize with credentials
    async function initializeWithCredentials(credentials) {
      try {
        // Import and apply fetch patch (patches global fetch)
        const { patchMatrixFetch } = await import('../utils/matrixFetchUtils');
        patchMatrixFetch();

        // Import client singleton
        const matrixClientSingleton = await import('../utils/matrixClientSingleton').then(m => m.default);

        // Create Matrix client directly (Element-web style)
        const { userId, accessToken, homeserver, deviceId } = credentials;
        const homeserverUrl = homeserver || 'https://dfix-hsbridge.duckdns.org';

        // Prepare client configuration
        const clientConfig = {
          homeserver: homeserverUrl,
          userId: userId,
          deviceId: deviceId || `DFIX_WEB_${Date.now()}`,
          accessToken: accessToken
        };

        logger.info('[PlatformConnectionModal] Creating new Matrix client for Telegram with credentials');
        const client = await matrixClientSingleton.getClient(clientConfig, userId);

        // Set the global Matrix client
        window.matrixClient = client;

        // Set up refresh listeners using matrixTokenRefresher
        matrixTokenRefresher.setupRefreshListeners(client, session.user.id);

        // Start the client directly
        logger.info('[PlatformConnectionModal] Starting Matrix client for Telegram');
        await client.startClient();

        logger.info('[PlatformConnectionModal] Matrix initialized successfully for Telegram');
        toast.success('Ready to connect Telegram', { id: 'telegram-init' });
        setStep('telegram-setup');

        return client;
      } catch (error) {
        logger.error('[PlatformConnectionModal] Error using credentials:', error);
        throw error;
      }
    }
  }, [session.user.id]);

  // Handle component mount and check for pre-selected platform
  // This handles the case where a platform is pre-selected before the modal is opened
  // For WhatsApp, it uses initializeMatrixForWhatsApp (not the regular initializeMatrix)
  // For Telegram, it uses initializeMatrixForTelegram
  useEffect(() => {
    if (isOpen) {
      // Check if a platform was pre-selected
      if (window.platformToConnect === 'telegram') {
        logger.info('[PlatformConnectionModal] Pre-selected platform: telegram');

        // Set loading state
        setLoading(true);

        // Clear any previous error states
        sessionStorage.removeItem('matrix_token_refreshing');

        // Set flag to indicate we're connecting to Telegram
        // This will trigger Matrix initialization in MatrixInitializer
        // This flag is critical for the token refresh mechanism
        sessionStorage.setItem('connecting_to_telegram', 'true');
        logger.info('[PlatformConnectionModal] Set connecting_to_telegram flag for pre-selected platform');

        // Use our direct connect utility with the new username pattern
        toast.loading('Connecting to Telegram...', { id: 'telegram-init' });

        // Use the new initializeMatrixForTelegram function
        initializeMatrixForTelegram(null)
          .catch(error => {
            logger.error('[PlatformConnectionModal] Error in pre-selected Telegram connection flow:', error);
            // Additional error handling if needed
          })
          .finally(() => {
            // Ensure loading state is cleared even if there's an error
            setLoading(false);
          });

        // Clear the selection after using it
        window.platformToConnect = null;
      } else if (window.platformToConnect === 'whatsapp') {
        logger.info('[PlatformConnectionModal] Pre-selected platform: whatsapp');

        // Clear any previous initialization flags
        sessionStorage.removeItem('whatsapp_initializing');

        // Start WhatsApp connection flow
        initializeMatrixForWhatsApp().then(() => {
          logger.info('[PlatformConnectionModal] Matrix initialized successfully for WhatsApp');
        }).catch(error => {
          logger.error('[PlatformConnectionModal] Error initializing Matrix for WhatsApp:', error);
          toast.error('Failed to prepare WhatsApp connection. Please try again.', { id: 'matrix-init' });
          setStep('intro');
        });
        // Clear the selection after using it
        window.platformToConnect = null;
      } else {
        logger.info('[PlatformConnectionModal] No pre-selected platform, showing intro');
        setStep('intro');
      }
    }
  }, [isOpen, initializeMatrixForTelegram, initializeMatrixForWhatsApp, session.user.id]);

  // Render different steps
  const renderStep = () => {
    switch (step) {
      case 'intro':
        return (
          <div>
            {/* Content */}
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-6">
                <h4 className="text-xl font-medium text-white mb-4">Connect a Messaging Platform</h4>
                <p className="text-gray-300 mb-6">You need to connect a messaging platform to start using DailyFix.</p>
              </div>

              <div className="flex justify-center space-x-10 mb-8" style={{ background: 'transparent' }}>
                {/* WhatsApp Button - Redesigned to match AIAssistantWelcome */}
                <div className="platform-icon-container">
                  {(accounts.some(acc => acc.platform === 'whatsapp' && (acc.status === 'active' || acc.status === 'pending')) || connectedPlatforms.includes('whatsapp')) ? (
                    <div className="platform-icon disabled">
                      <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center relative">
                        <FaWhatsapp className="text-green-500 text-4xl" />
                      </div>
                      <div className="mt-2 flex flex-col items-center">
                        <span className="text-xs text-gray-300">Already Connected</span>
                        <span className="badge-small bg-green-600 text-white text-xs px-2 py-0.5 rounded-full mt-1">Connected</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`platform-icon ${loading ? 'loading' : ''}`}
                      onClick={() => {
                        if (loading) return;
                        sessionStorage.removeItem('whatsapp_initializing');
                        initializeMatrix();
                      }}
                    >
                      <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                        {loading ? (
                          <div className="animate-spin">
                            <FaWhatsapp className="text-green-500 text-4xl opacity-70" />
                          </div>
                        ) : (
                          <FaWhatsapp className="text-green-500 text-4xl" />
                        )}
                      </div>
                      <span className="mt-2 text-xs text-gray-300">{loading ? 'Connecting...' : 'Connect WhatsApp'}</span>
                    </div>
                  )}
                </div>

                {/* Telegram Button - Redesigned to match AIAssistantWelcome */}
                <div className="platform-icon-container">
                  {(accounts.some(acc => acc.platform === 'telegram' && (acc.status === 'active' || acc.status === 'pending')) || connectedPlatforms.includes('telegram')) ? (
                    <div className="platform-icon disabled">
                      <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center relative">
                        <FaTelegram className="text-blue-500 text-4xl" />
                      </div>
                      <div className="mt-2 flex flex-col items-center">
                        <span className="text-xs text-gray-300">Already Connected</span>
                        <span className="badge-small bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full mt-1">Connected</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`platform-icon ${loading ? 'loading' : ''}`}
                      onClick={() => {
                        if (loading) return;

                        // Set loading state
                        setLoading(true);

                        // Clear any previous error states
                        sessionStorage.removeItem('matrix_token_refreshing');

                        toast.loading('Preparing Telegram connection...', { id: 'telegram-init' });

                        // This flag is critical for the token refresh mechanism
                        sessionStorage.setItem('connecting_to_telegram', 'true');
                        logger.info('[PlatformConnectionModal] Set connecting_to_telegram flag');

                        toast.loading('Connecting to Telegram...', { id: 'telegram-init' });

                        // Initialize Matrix for Telegram using client-side approach
                        initializeMatrixForTelegram(null)
                          .catch(error => {
                            logger.error('[PlatformConnectionModal] Error in Telegram connection flow:', error);
                            // Additional error handling if needed
                          })
                          .finally(() => {
                            // Ensure loading state is cleared even if there's an error
                            setLoading(false);
                          });
                      }}
                    >
                      <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center">
                        {loading ? (
                          <div className="animate-spin">
                            <FaTelegram className="text-blue-500 text-4xl opacity-70" />
                          </div>
                        ) : (
                          <FaTelegram className="text-blue-500 text-4xl" />
                        )}
                      </div>
                      <span className="mt-2 text-xs text-gray-300">{loading ? 'Connecting...' : 'Connect Telegram'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress dots - similar to AIAssistantWelcome */}
              <div className="flex justify-center space-x-2 mb-6">
                <div className="w-2 h-2 rounded-full bg-[#0088CC]" />
                <div className="w-2 h-2 rounded-full bg-gray-600" />
                <div className="w-2 h-2 rounded-full bg-gray-600" />
              </div>
            </div>

            {/* Footer with info */}
            <div className="p-5 border-t text-xs border-white/10">
              <div className="flex items-start mb-3">
                <FaLock className="text-gray-400 mt-1 mr-2" />
                <p className="text-gray-300">Your messages are end-to-end encrypted and secure.</p>
              </div>
              <div className="flex items-start">
                <FaCheck className="text-[#0088CC] mt-1 mr-2" />
                <p className="text-gray-300">Connect your messaging platforms to manage all your conversations in one place.</p>
              </div>
            </div>
          </div>
        );

      case 'whatsapp-setup':
        return (
          <div>
            {/* Content */}
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                  <FaWhatsapp className="w-12 h-12 text-green-500" />
                </div>
                <h4 className="text-xl font-medium text-white mb-2">Scan QR Code</h4>
                <p className="text-gray-300">
                  Scan this QR code with your WhatsApp app to connect your account.
                </p>
              </div>

              <WhatsAppBridgeSetup
                onComplete={handleWhatsAppComplete}
                onCancel={() => setStep('intro')}
              />

              {/* Progress dots */}
              <div className="flex justify-center space-x-2 mt-6 mb-2">
                <div className="w-2 h-2 rounded-full bg-gray-600" />
                <div className="w-2 h-2 rounded-full bg-[#0088CC]" />
                <div className="w-2 h-2 rounded-full bg-gray-600" />
              </div>
            </div>

            {/* Footer with buttons */}
            <div className="p-4 border-t border-white/10 flex justify-between">
              <button
                onClick={() => setStep('intro')}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        );

      case 'telegram-setup':
        return (
          <div>
            {/* Content */}
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-24 h-24 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
                  <FaTelegram className="w-12 h-12 text-blue-500" />
                </div>
                <h4 className="text-xl font-medium text-white mb-2">Connect Telegram</h4>
                <p className="text-gray-300">
                  Follow the steps to connect your Telegram account.
                </p>
              </div>

              <TelegramConnection
                onComplete={handleTelegramComplete}
                onCancel={() => setStep('intro')}
              />

              {/* Progress dots */}
              <div className="flex justify-center space-x-2 mt-6 mb-2">
                <div className="w-2 h-2 rounded-full bg-gray-600" />
                <div className="w-2 h-2 rounded-full bg-[#0088CC]" />
                <div className="w-2 h-2 rounded-full bg-gray-600" />
              </div>
            </div>

            {/* Footer with buttons */}
            <div className="p-4 border-t border-white/10 flex justify-between">
              <button
                onClick={() => setStep('intro')}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        );

      case 'success':
        return (
          <div>
            {/* Content */}
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                  <FaCheck className="w-12 h-12 text-green-500" />
                </div>
                <h4 className="text-xl font-medium text-white mb-2">Connection Successful!</h4>
                <p className="text-gray-300">
                  Your account has been successfully connected to DailyFix.
                </p>
              </div>

              {/* Progress dots */}
              <div className="flex justify-center space-x-2 mb-6">
                <div className="w-2 h-2 rounded-full bg-gray-600" />
                <div className="w-2 h-2 rounded-full bg-gray-600" />
                <div className="w-2 h-2 rounded-full bg-[#0088CC]" />
              </div>
            </div>

            {/* Footer with buttons */}
            <div className="p-4 border-t border-white/10 flex justify-between">
              <button
                onClick={() => setStep('intro')}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                className="px-6 py-2 bg-[#0088CC] hover:bg-[#0077BB] text-white rounded-md flex items-center transition-colors"
              >
                Continue to Dashboard <FaCheck className="ml-2" />
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-neutral-900 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-white/10 animate-fadeIn max-h-[90vh] overflow-y-auto"
          >
            {/* Header with close button */}
            <div className="flex justify-between items-center p-2 border-b border-white/10">
              {/* <h3 className="text-xl font-medium text-white">
                Platform Connection
              </h3> */}
              <button
                onClick={handleClose}
                className="text-gray-400 w-auto hover:text-white transition-colors"
                aria-label="Close"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            {renderStep()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PlatformConnectionModal;
