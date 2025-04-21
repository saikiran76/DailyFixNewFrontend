import React, { useState, useEffect } from 'react';
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
import { saveToIndexedDB } from '../utils/indexedDBHelper';
import matrixDirectConnect from '../utils/matrixDirectConnect';
import matrixTokenRefresher from '../utils/matrixTokenRefresher';
import '../styles/platformButtons.css';

// Constants
const MATRIX_CREDENTIALS_KEY = 'matrix_credentials';

const PlatformConnectionModal = ({ isOpen, onClose, onConnectionComplete }) => {
  const dispatch = useDispatch();
  const { accounts } = useSelector(state => state.onboarding);
  const { session } = useSelector(state => state.auth);
  const [step, setStep] = useState('intro'); // intro, matrix-setup, whatsapp-setup, telegram-setup, success
  const [loading, setLoading] = useState(false); // Add loading state for UI feedback

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
  const initializeMatrixForWhatsApp = async () => {
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

            // Register a new Matrix account using the imported utility
            credentials = await matrixRegistration.registerMatrixAccount(session.user.id);

            if (!credentials || !credentials.accessToken) {
              throw new Error('Registration completed but no valid credentials returned');
            }

            logger.info('[PlatformConnectionModal] Successfully registered new Matrix account');
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
  };

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

  // Handle component mount and check for pre-selected platform
  // This handles the case where a platform is pre-selected before the modal is opened
  // For WhatsApp, it uses initializeMatrixForWhatsApp (not the regular initializeMatrix)
  // For Telegram, it uses initializeMatrixForTelegram
  useEffect(() => {
    if (isOpen) {
      // Check if a platform was pre-selected
      if (window.platformToConnect === 'telegram') {
        logger.info('[PlatformConnectionModal] Pre-selected platform: telegram');

        // Set flag to indicate we're connecting to Telegram
        // This will trigger Matrix initialization in MatrixInitializer
        sessionStorage.setItem('connecting_to_telegram', 'true');
        logger.info('[PlatformConnectionModal] Set connecting_to_telegram flag for pre-selected platform');

        // Use our direct connect utility with the new username pattern
        toast.loading('Connecting to Telegram...', { id: 'telegram-init' });

        // Connect to Matrix using our direct connect utility
        matrixDirectConnect.connectToMatrix(session.user.id).then(client => {
          // Set the global Matrix client
          window.matrixClient = client;

          // Set up token refresh listeners
          matrixTokenRefresher.setupRefreshListeners(client, session.user.id);

          // Start the client
          return matrixDirectConnect.startClient(client);
        }).then(() => {
          logger.info('[PlatformConnectionModal] Matrix initialized successfully for Telegram');
          toast.success('Ready to connect Telegram', { id: 'telegram-init' });
          setStep('telegram-setup');

          // Automatically close the modal after a short delay
          setTimeout(() => {
            setShowModal(false);
          }, 1000);
        }).catch(error => {
          logger.error('[PlatformConnectionModal] Error initializing Matrix for Telegram:', error);
          toast.error('Failed to prepare Telegram connection. Please try again.', { id: 'telegram-init' });
          setStep('intro');
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
  }, [isOpen]);

  // Render different steps
  const renderStep = () => {
    switch (step) {
      case 'intro':
        return (
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-6">Connect a Messaging Platform</h3>
            <p className="text-gray-300 mb-8">You need to connect a messaging platform to start using DailyFix.</p>

            <div className="flex justify-center space-x-10 mb-8">
              {/* WhatsApp Button */}
              {accounts.some(acc => acc.platform === 'whatsapp' && (acc.status === 'active' || acc.status === 'pending')) ? (
                <div className="platform-button disabled group relative">
                  <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center transform transition-all duration-300 opacity-90 relative">
                    <FaWhatsapp className="text-white text-4xl" />
                    <div className="connected-badge">
                      Connected
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black bg-opacity-70 text-white text-sm py-1 px-3 rounded-lg mt-24">
                      Already Connected
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`platform-button group relative ${loading ? 'loading cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => {
                    // Prevent multiple clicks
                    if (loading) return;

                    // Clear any previous initialization flags
                    sessionStorage.removeItem('whatsapp_initializing');

                    // This uses the original initializeMatrix function for WhatsApp
                    // NOT initializeMatrixForWhatsApp which is only for pre-selection
                    initializeMatrix();
                  }}
                >
                  <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg">
                    {loading ? (
                      <div className="animate-spin">
                        <FaWhatsapp className="text-white text-4xl opacity-70" />
                      </div>
                    ) : (
                      <FaWhatsapp className="text-white text-4xl" />
                    )}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black bg-opacity-70 text-white text-sm py-1 px-3 rounded-lg mt-24">
                      {loading ? 'Connecting...' : 'Connect WhatsApp'}
                    </div>
                  </div>
                </div>
              )}

              {/* Telegram Button */}
              {accounts.some(acc => acc.platform === 'telegram' && (acc.status === 'active' || acc.status === 'pending')) ? (
                <div className="platform-button disabled group relative">
                  <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center transform transition-all duration-300 opacity-90 relative">
                    <FaTelegram className="text-white text-4xl" />
                    <div className="connected-badge">
                      Connected
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black bg-opacity-70 text-white text-sm py-1 px-3 rounded-lg mt-24">
                      Already Connected
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="platform-button telegram group relative cursor-pointer"
                  onClick={() => {
                    // Show loading state immediately for better UX
                    const button = document.querySelector('.platform-button.telegram');
                    if (button) {
                      button.classList.add('loading');
                    }

                    // Start fresh with a clean state
                    toast.loading('Preparing Telegram connection...', { id: 'telegram-init' });

                    // Set flag to indicate we're connecting to Telegram
                    // This will trigger Matrix initialization in MatrixInitializer
                    sessionStorage.setItem('connecting_to_telegram', 'true');
                    logger.info('[PlatformConnectionModal] Set connecting_to_telegram flag');

                    // Use our direct connect utility
                    toast.loading('Connecting to Telegram...', { id: 'telegram-init' });

                    // Connect to Matrix using our direct connect utility
                    // This will use the MatrixInitializer component which will now initialize
                    // because we set the connecting_to_telegram flag
                    matrixDirectConnect.connectToMatrix(session.user.id).then(client => {
                      // Set the global Matrix client
                      window.matrixClient = client;

                      // Set up token refresh listeners
                      matrixTokenRefresher.setupRefreshListeners(client, session.user.id);

                      // Start the client
                      return matrixDirectConnect.startClient(client);
                    }).then(() => {
                      logger.info('[PlatformConnectionModal] Matrix initialized successfully for Telegram');
                      toast.success('Ready to connect Telegram', { id: 'telegram-init' });
                      setStep('telegram-setup');

                      // Automatically close the modal after a short delay
                      setTimeout(() => {
                        setShowModal(false);
                      }, 1000);
                    }).catch(error => {
                      logger.error('[PlatformConnectionModal] Error initializing Matrix for Telegram:', error);
                      toast.error('Failed to prepare Telegram connection. Please try again.', { id: 'telegram-init' });

                      // Remove loading state on error
                      if (button) {
                        button.classList.remove('loading');
                      }
                    });
                  }}
                >
                  <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg">
                    <FaTelegram className="text-white text-4xl" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black bg-opacity-70 text-white text-sm py-1 px-3 rounded-lg mt-24">
                      Connect Telegram
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-gray-700 pt-6 text-left">
              <div className="flex items-start mb-3">
                <FaLock className="text-gray-500 mt-1 mr-2" />
                <p className="text-gray-300">Your messages are end-to-end encrypted and secure.</p>
              </div>
              <div className="flex items-start">
                <FaCheck className="text-green-500 mt-1 mr-2" />
                <p className="text-gray-300">Connect your messaging platforms to manage all your conversations in one place.</p>
              </div>
            </div>
          </div>
        );

      case 'whatsapp-setup':
        return (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-center">Scan QR Code</h3>
            <p className="text-gray-600 mb-6 text-center">
              Scan this QR code with your WhatsApp app to connect your account.
            </p>
            <WhatsAppBridgeSetup
              onComplete={handleWhatsAppComplete}
              onCancel={() => setStep('intro')}
            />
          </div>
        );

      case 'telegram-setup':
        return (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-center">Connect Telegram</h3>
            <TelegramConnection
              onComplete={handleTelegramComplete}
              onCancel={() => setStep('intro')}
            />
          </div>
        );

      case 'success':
        return (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FaCheck className="text-green-500 text-2xl" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Connection Successful!</h3>
            <p className="text-gray-600 mb-6">
              Your account has been successfully connected to DailyFix.
            </p>
            <button
              onClick={handleComplete}
              className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium"
            >
              Continue to Dashboard
            </button>
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
          className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-90 p-4 overflow-auto"
          style={{ backdropFilter: 'blur(2px)' }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gradient-to-r bg-black/75 transition-opacity duration-200 ease-in-out rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Platform Connection</h2>
              <button
                onClick={handleClose}
                className="text-gray-300 hover:text-gray-600 w-auto bg-transparent"
                aria-label="Close"
              >
                <FaTimes />
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
