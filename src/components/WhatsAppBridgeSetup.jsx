import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSocketConnection } from '../hooks/useSocketConnection';
import api from '../utils/api';  // Our configured axios instance
import QRCode from 'qrcode';
import logger from '../utils/logger';
import { toast } from 'react-toastify';
// EMERGENCY FIX: Removed supabase import to prevent infinite reload
import { refreshTokenWithTimeout } from '../utils/tokenRefreshHelper';
// Use localStorage as a fallback for WhatsApp connection status
import { saveWhatsAppStatus } from '../utils/connectionStorage';
import { shouldAllowCompleteTransition } from '../utils/onboardingFix';
import {
  setWhatsappQRCode,
  setWhatsappSetupState,
  setWhatsappError,
  resetWhatsappSetup,
  setBridgeRoomId,
  selectWhatsappSetup,
  setWhatsappPhoneNumber,
  setWhatsappConnected
} from '../store/slices/onboardingSlice';

const WhatsAppBridgeSetup = ({ onComplete }) => {
  const dispatch = useDispatch();
  const { socket, isConnected } = useSocketConnection('matrix');
  const { session } = useSelector(state => state.auth);
  const {
    loading: reduxLoading,
    error: reduxError,
    qrCode,
    timeLeft,
    qrExpired,
    setupState
  } = useSelector(selectWhatsappSetup);

  // Component state
  const [isInitializing, setIsInitializing] = useState(true);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollInterval, setPollInterval] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // Use a ref to track if a QR code has been received
  const qrReceivedRef = useRef(false);

  // Stop polling function - defined first to avoid circular dependency
  const stopPolling = useCallback(() => {
    if (pollInterval) {
      logger.info('[WhatsAppBridgeSetup] Stopping polling for WhatsApp login status');
      clearInterval(pollInterval);
      setPollInterval(null);
      setIsPolling(false);
    }
  }, [pollInterval]);

  // Function to poll the WhatsApp login status
  const checkLoginStatus = useCallback(async () => {
    try {
      logger.info('[WhatsAppBridgeSetup] Polling WhatsApp login status...');
      const response = await api.get('/api/v1/matrix/whatsapp/status', {
        timeout: 10000 // 10 second timeout to prevent hanging requests
      });

      logger.info('[WhatsAppBridgeSetup] Status response:', response.data);

      // Check if WhatsApp is connected
      if (response.data?.status === 'active') {
        logger.info('[WhatsAppBridgeSetup] Login status poll successful - WhatsApp connected!', response.data);

        // Stop polling
        stopPolling();

        // Update the state
        dispatch(setWhatsappSetupState('connected'));
        dispatch(setWhatsappConnected(true));

        // Get bridge room ID from response if available
        if (response.data.bridgeRoomId) {
          dispatch(setBridgeRoomId(response.data.bridgeRoomId));
        }

        // Use localStorage as a fallback for WhatsApp connection status
        if (session?.user?.id) {
          saveWhatsAppStatus(true, session.user.id);
          logger.info('[WhatsAppBridgeSetup] Saved WhatsApp connection status to localStorage');
        }
        logger.info('[WhatsAppBridgeSetup] WhatsApp connection detected');

        // Call onComplete callback if provided
        if (onComplete && typeof onComplete === 'function') {
          if (shouldAllowCompleteTransition()) {
            onComplete();
          }
        }
      }
    } catch (error) {
      logger.error('[WhatsAppBridgeSetup] Error polling login status:', error);
    }
  }, [dispatch, onComplete, stopPolling]);

  // Start polling
  const startPolling = useCallback(() => {
    if (!isPolling && !pollInterval) {
      logger.info('[WhatsAppBridgeSetup] Starting polling for WhatsApp login status');
      setIsPolling(true);
      // Run once immediately
      checkLoginStatus();
      // Then set up interval
      const interval = setInterval(checkLoginStatus, 2000); // Poll every 2 seconds
      setPollInterval(interval);

      // Set a timeout to stop polling after 5 minutes (300 seconds) to prevent infinite polling
      setTimeout(() => {
        if (interval) {
          logger.info('[WhatsAppBridgeSetup] Stopping polling after timeout');
          clearInterval(interval);
          setPollInterval(currentInterval => currentInterval === interval ? null : currentInterval);
          setIsPolling(false);
        }
      }, 300000); // 5 minutes
    }
  }, [isPolling, pollInterval, checkLoginStatus]);

  // Initialize connection to WhatsApp with retry logic
  const initializeConnection = useCallback(() => {
    logger.info('[WhatsAppBridgeSetup] Initializing WhatsApp connection, attempt:', retryCount + 1);
    setIsInitializing(true);

    // Calculate backoff delay (exponential: 1s, 2s, 4s, etc.)
    const backoffDelay = retryCount > 0 ? Math.pow(2, retryCount - 1) * 1000 : 0;

    // If this is a retry, wait before making the request
    setTimeout(() => {
      // Make API call to initialize WhatsApp connection
      api.post('/api/v1/matrix/whatsapp/connect')
        .then(response => {
          logger.info('[WhatsAppBridgeSetup] WhatsApp setup initialized successfully:', response.data);
          setIsInitializing(false);
          setRetryCount(0); // Reset retry count on success

          // *** ADDED FIX: Process QR code directly from API response if available ***
          if (response.data && response.data.status === 'qr_ready' && response.data.qrCode) {
            logger.info('[WhatsAppBridgeSetup] Processing QR code from API response...');
        QRCode.toDataURL(response.data.qrCode, {
          errorCorrectionLevel: 'L',
          margin: 4,
          width: 256
        })
        .then(qrDataUrl => {
              logger.info('[WhatsAppBridgeSetup] QR code from API converted successfully');
              dispatch(setWhatsappQRCode(qrDataUrl)); // Update Redux state
              dispatch(setWhatsappSetupState('qr_ready')); // Ensure state is correct
              qrReceivedRef.current = true; // Mark QR as received
            })
            .catch(error => {
              logger.error('[WhatsAppBridgeSetup] API QR code conversion error:', error);
              dispatch(setWhatsappError('Failed to generate QR code from API response'));
              dispatch(setWhatsappSetupState('error'));
            });
          } else if (response.data && response.data.status !== 'qr_ready') {
            // If the API indicates a status other than qr_ready, update the state
            dispatch(setWhatsappSetupState(response.data.status || 'waiting_for_qr'));
          }
          // *** END ADDED FIX ***

        })
        .catch(error => {
          logger.error('[WhatsAppBridgeSetup] Error initializing WhatsApp setup:', error);

          // Check if we should retry
          if (retryCount < maxRetries &&
              error.response &&
              (error.response.status === 429 || error.response.status === 500)) {

            logger.info(`[WhatsAppBridgeSetup] Retrying (${retryCount + 1}/${maxRetries})...`);
            setRetryCount(prevCount => prevCount + 1);

            // Don't show error toast for retries
            setIsInitializing(false);
            setTimeout(() => {
              initializeConnection(); // Retry the connection
            }, 1000); // Wait a second before retrying to avoid UI flicker
            return;
          }

          // If we've exhausted retries or it's not a retryable error
          setIsInitializing(false);
          setShowRetryButton(true);
          setRetryCount(0); // Reset retry count

          // CRITICAL FIX: Check if the error is due to an invalid session
          if (error.response && error.response.status === 401) {
            logger.error('[WhatsAppBridgeSetup] Authentication error, redirecting to login');
            // Clear any problematic localStorage items
            localStorage.removeItem('dailyfix_auth');
            // Redirect to login
            window.location.href = '/login';
          } else if (error.response && (error.response.status === 500 || error.response.status === 429)) {
            // Show a more user-friendly error message for server errors
            toast.error('The WhatsApp service is currently unavailable. Please try again later.');
            // Update Redux state with error
            dispatch(setWhatsappError('The WhatsApp service is currently unavailable'));
            dispatch(setWhatsappSetupState('error'));
      } else {
            // Show a generic error message for other errors
            toast.error('Failed to connect to WhatsApp. Please try again.');
            // Update Redux state with error
            dispatch(setWhatsappError(error.message || 'Failed to initialize WhatsApp'));
        dispatch(setWhatsappSetupState('error'));
      }
        });
    }, backoffDelay);
  }, [retryCount, dispatch]);

  // Handle retry button click
  const handleRetry = useCallback(() => {
    logger.info('[WhatsAppBridgeSetup] Retry button clicked');
    setShowRetryButton(false);
    dispatch(resetWhatsappSetup());

    // Reinitialize the connection
    initializeConnection();
  }, [dispatch, initializeConnection]);

  // Start polling when QR code is displayed
  useEffect(() => {
    if (qrCode) {
      logger.info('[WhatsAppBridgeSetup] QR code displayed, starting polling');
      qrReceivedRef.current = true;
      startPolling();
    }
  }, [qrCode, startPolling]);

  // Handle socket connection
  useEffect(() => {
    if (socket && isConnected) {
      logger.info('[WhatsAppBridgeSetup] Socket connected, joining room');

      // Join user room for targeted events
      if (session?.user?.id) {
        socket.emit('join', `user:${session.user.id}`);
        logger.info('[WhatsAppBridgeSetup] Joining socket room:', `user:${session.user.id}`);
      }

      // Listen for WhatsApp setup status updates
    socket.on('whatsapp:setup:status', (data) => {
        logger.info('[WhatsAppBridgeSetup] Received WhatsApp setup status update:', data);

        if (data.state === 'qr_ready' && data.qrCode) {
          // Convert QR code to data URL
          QRCode.toDataURL(data.qrCode, {
            errorCorrectionLevel: 'L',
            margin: 4,
            width: 256
          })
          .then(qrDataUrl => {
            logger.info('[WhatsAppBridgeSetup] QR code converted successfully');
            dispatch(setWhatsappQRCode(qrDataUrl));
        dispatch(setWhatsappSetupState('qr_ready'));
            qrReceivedRef.current = true;
          })
          .catch(error => {
            logger.error('[WhatsAppBridgeSetup] QR code conversion error:', error);
            dispatch(setWhatsappError('Failed to generate QR code'));
            dispatch(setWhatsappSetupState('error'));
          });
      } else if (data.state === 'connected') {
          logger.info('[WhatsAppBridgeSetup] WhatsApp connected via socket event');
        dispatch(setWhatsappSetupState('connected'));
        dispatch(setWhatsappConnected(true));
        if (data.bridgeRoomId) {
          dispatch(setBridgeRoomId(data.bridgeRoomId));
        }
        
          // Call onComplete callback if provided
          if (onComplete && typeof onComplete === 'function') {
            if (shouldAllowCompleteTransition()) {
              onComplete();
            }
          }
        }
      });

      // Listen for WhatsApp status updates
      socket.on('whatsapp:status', (data) => {
        logger.info('[WhatsAppBridgeSetup] Received WhatsApp status update:', data);

        if (data.status === 'active') {
          logger.info('[WhatsAppBridgeSetup] WhatsApp connected via status update');
          dispatch(setWhatsappSetupState('connected'));
          dispatch(setWhatsappConnected(true));
          if (data.bridgeRoomId) {
            dispatch(setBridgeRoomId(data.bridgeRoomId));
          }

          // Use localStorage as a fallback for WhatsApp connection status
          if (session?.user?.id) {
            saveWhatsAppStatus(true, session.user.id);
            logger.info('[WhatsAppBridgeSetup] Saved WhatsApp connection status to localStorage via socket event');
          }

          // Call onComplete callback if provided
          if (onComplete && typeof onComplete === 'function') {
            if (shouldAllowCompleteTransition()) {
              onComplete();
            }
        }
      }
    });

    return () => {
        logger.info('[WhatsAppBridgeSetup] Socket listeners removed');
      socket.off('whatsapp:setup:status');
        socket.off('whatsapp:status');
      };
    }
  }, [socket, isConnected, session, dispatch, onComplete]);

  // Initiate connection when component mounts
  useEffect(() => {
    // Always call handleConnect when component mounts
    logger.info('[WhatsAppBridgeSetup] Component mounted, initiating connection');
    // Wrap in try-catch to handle any errors
    try {
      initializeConnection();
    } catch (error) {
      logger.error('[WhatsAppBridgeSetup] Error initiating connection:', error);
      dispatch(setWhatsappError('Failed to connect to WhatsApp. Please try again.'));
      dispatch(setWhatsappSetupState('error'));
    }
  }, [initializeConnection, dispatch]);

  // Refined unmount cleanup: only reset if a QR code has not been received
  useEffect(() => {
    return () => {
      if (!qrReceivedRef.current) {
        dispatch(resetWhatsappSetup());
      }
      stopPolling();
    };
  }, [dispatch, stopPolling]);

  // Helper function to format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine content based on state
  let content = null;

  if (isInitializing || reduxLoading) {
    content = (
      <div className="max-w-md mx-auto p-8 text-center bg-white/5 rounded-lg">
        <h2 className="text-2xl font-bold mb-6 text-white">Connecting to WhatsApp</h2>
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
          <p className="text-gray-300">Initializing WhatsApp connection...</p>
          <p className="text-gray-400 text-sm mt-2">This may take a few moments</p>
          </div>
      </div>
    );
  } else if (qrCode) {
    content = (
      <div className="max-w-md mx-auto p-8 text-center bg-white/5 rounded-lg">
        <h2 className="text-2xl font-bold mb-6 text-white">Connect WhatsApp</h2>
        <div className="bg-white p-4 rounded-lg mb-6 inline-block">
          <img
            src={qrCode}
            alt="WhatsApp QR Code"
            className="w-64 h-64"
            onError={(e) => {
              logger.error('[WhatsAppBridgeSetup] QR code image error:', e);
              e.target.style.display = 'none';
            }}
          />
        </div>
        <div className="text-gray-300 mb-4">
          <p className="mb-2">1. Open WhatsApp on your phone</p>
          <p className="mb-2">2. Tap Menu or Settings and select WhatsApp Web</p>
          <p className="mb-2">3. Point your phone to this screen to scan the code</p>
        </div>
        {qrExpired && (
          <div className="bg-red-900/20 p-4 rounded-lg mb-4">
            <p className="text-red-300">QR code expired. Please try again.</p>
            <button
              className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
              onClick={handleRetry}
            >
              Refresh QR Code
            </button>
        </div>
        )}
        {timeLeft > 0 && (
          <p className="text-gray-400 text-sm">
            QR code expires in {formatTime(timeLeft)}
          </p>
        )}
      </div>
    );
  } else if (setupState === 'error') {
    const errorMessage = reduxError?.message || reduxError || 'Failed to connect WhatsApp';
    const is500Error = errorMessage && (errorMessage.includes('500') || errorMessage.includes('unavailable') || errorMessage.includes('Internal Server Error'));
    content = (
      <div className="max-w-md mx-auto p-8 text-center bg-white/5 rounded-lg">
        <h2 className="text-2xl font-bold mb-6 text-white">Connection Error</h2>
        <div className="bg-red-900/20 p-4 rounded-lg mb-6">
          <p className="text-red-300 mb-2">{errorMessage}</p>
          <p className="text-gray-400 text-sm">
            {is500Error ? 'The WhatsApp service is currently unavailable. Please try again later.' : 'The connection to WhatsApp timed out. This could be due to network issues or high server load.'}
          </p>
        </div>
        {showRetryButton && (
          <button
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
            onClick={handleRetry}
          >
            Try Again
          </button>
        )}
      </div>
    );
  } else {
    content = (
      <div className="max-w-md mx-auto p-8 text-center bg-white/5 rounded-lg">
        <h2 className="text-2xl font-bold mb-6 text-white">Connect WhatsApp</h2>
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mb-4"></div>
          <p className="text-gray-300">Waiting for QR code...</p>
          <p className="text-gray-400 text-sm mt-2">This may take a few moments</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {content}
    </>
  );
};

export default WhatsAppBridgeSetup;
