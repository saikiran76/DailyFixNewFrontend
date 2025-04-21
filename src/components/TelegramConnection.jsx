import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'react-hot-toast';
import { FiLoader, FiAlertTriangle, FiCheck, FiClock, FiRefreshCw } from 'react-icons/fi';
import { FaTelegram } from 'react-icons/fa';
// Import MatrixInitializer for Telegram connection
import MatrixInitializer from './MatrixInitializer';
import { updateAccounts } from '../store/slices/onboardingSlice';
import { setSyncState } from '../store/slices/matrixSlice';
import logger from '../utils/logger';
import roomListManager from '../utils/roomListManager';
import { saveToIndexedDB } from '../utils/indexedDBHelper';
import matrixTokenRefresher from '../utils/matrixTokenRefresher';

// Telegram bot Matrix user ID for the specific homeserver
const TELEGRAM_BOT_USER_ID = '@telegrambot:dfix-hsbridge.duckdns.org';

const TelegramConnection = ({ onComplete, onCancel }) => {
  const dispatch = useDispatch();
  // Matrix client is accessed via window.matrixClient
  const { accounts } = useSelector(state => state.onboarding);
  const { session } = useSelector(state => state.auth);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Enhanced steps: initial, creating_room, sending_login, phone_input, code_input, connecting, complete
  const [step, setStep] = useState('initial');
  const [roomId, setRoomId] = useState(null);

  // Phone number input state
  const [countryCode, setCountryCode] = useState('+');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState(null);

  // Verification code input state
  const [verificationCode, setVerificationCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(180); // 3 minutes in seconds
  const timerRef = useRef(null);

  // Bot response tracking
  const [waitingForBotResponse, setWaitingForBotResponse] = useState(false);
  const [botResponseTimeout, setBotResponseTimeout] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  // Room listener cleanup function
  const [roomListener, setRoomListener] = useState(null);

  useEffect(() => {
    // Check if Telegram is already connected
    const telegramAccount = accounts.find(acc => acc.platform === 'telegram');
    if (telegramAccount) {
      setStep('complete');
    }
  }, [accounts]);

  // Get Matrix state from Redux
  const { syncState: matrixSyncState } = useSelector(state => state.matrix);
  const [globalClient, setGlobalClient] = useState(null);

  // Check for Matrix client on component mount and ensure it's valid
  useEffect(() => {
    let checkInterval;
    let attempts = 0;
    const maxAttempts = 30; // 15 seconds total

    const checkForMatrixClient = async () => {
      attempts++;

      // Check for global Matrix client
      if (window.matrixClient) {
        logger.info('[TelegramConnection] Using global Matrix client');

        try {
          // Ensure the client is valid and refresh if needed
          const validClient = await matrixTokenRefresher.ensureValidClient(window.matrixClient, session.user.id);

          // Set up token refresh listeners
          matrixTokenRefresher.setupRefreshListeners(validClient, session.user.id);

          // Update the global client reference
          setGlobalClient(validClient);
          window.matrixClient = validClient; // Ensure global reference is updated

          // Check client state
          const syncState = validClient.getSyncState();
          logger.info(`[TelegramConnection] Global Matrix client sync state: ${syncState}`);

          // Both PREPARED and SYNCING states are valid for operations
          if (syncState === 'PREPARED' || syncState === 'SYNCING') {
            logger.info('[TelegramConnection] Global Matrix client is ready for use');
            dispatch(setSyncState(syncState));

            // Store sync state in localStorage for persistence
            localStorage.setItem('matrix_sync_state', syncState);

            // Clear the interval once we have a valid client in a valid state
            if (checkInterval) {
              clearInterval(checkInterval);
            }

            // Automatically start the Telegram connection process
            if (step === 'initial') {
              logger.info('[TelegramConnection] Matrix client ready, starting Telegram connection process');
              startTelegramConnection();
            }
          } else {
            // If client is not in a valid state, force a refresh
            logger.warn(`[TelegramConnection] Matrix client in invalid state: ${syncState}, refreshing`);
            const refreshedClient = await matrixTokenRefresher.refreshClient(session.user.id);
            setGlobalClient(refreshedClient);
            window.matrixClient = refreshedClient;

            // Check the state of the refreshed client
            const refreshedSyncState = refreshedClient.getSyncState();
            logger.info(`[TelegramConnection] Refreshed Matrix client sync state: ${refreshedSyncState}`);
            dispatch(setSyncState(refreshedSyncState));

            // Store sync state in localStorage for persistence
            localStorage.setItem('matrix_sync_state', refreshedSyncState);
          }
        } catch (error) {
          logger.error('[TelegramConnection] Error ensuring valid Matrix client:', error);

          // If we've reached the maximum number of attempts, try one last refresh
          if (attempts >= maxAttempts) {
            try {
              logger.warn('[TelegramConnection] Maximum attempts reached, trying one last refresh');
              const lastChanceClient = await matrixTokenRefresher.refreshClient(session.user.id);
              setGlobalClient(lastChanceClient);
              window.matrixClient = lastChanceClient;

              // Check the state of the refreshed client
              const lastChanceSyncState = lastChanceClient.getSyncState();
              logger.info(`[TelegramConnection] Last chance Matrix client sync state: ${lastChanceSyncState}`);
              dispatch(setSyncState(lastChanceSyncState));

              // Store sync state in localStorage for persistence
              localStorage.setItem('matrix_sync_state', lastChanceSyncState);

              // Clear the interval
              clearInterval(checkInterval);
            } catch (lastError) {
              logger.error('[TelegramConnection] Last chance refresh failed:', lastError);
              toast.error('Could not establish a stable connection. Please refresh and try again.', { id: 'matrix-init' });
              clearInterval(checkInterval);
            }
          }
        }
      } else {
        // Log warning every 4 attempts (2 seconds)
        if (attempts === 1 || attempts % 4 === 0) {
          logger.warn(`[TelegramConnection] Waiting for Matrix client to initialize (attempt ${attempts}/${maxAttempts})`);
        }

        // If we've reached the maximum number of attempts, try to create a new client
        if (attempts >= maxAttempts) {
          try {
            logger.warn('[TelegramConnection] Maximum attempts reached, creating new Matrix client');
            const newClient = await matrixTokenRefresher.refreshClient(session.user.id);
            setGlobalClient(newClient);
            window.matrixClient = newClient;

            // Check the state of the new client
            const newSyncState = newClient.getSyncState();
            logger.info(`[TelegramConnection] New Matrix client sync state: ${newSyncState}`);
            dispatch(setSyncState(newSyncState));

            // Store sync state in localStorage for persistence
            localStorage.setItem('matrix_sync_state', newSyncState);

            // Clear the interval
            clearInterval(checkInterval);
          } catch (createError) {
            logger.error('[TelegramConnection] Error creating new Matrix client:', createError);
            toast.error('Matrix client not available. Please refresh and try again.', { id: 'matrix-init' });
            clearInterval(checkInterval);
          }
        }
      }
    };

    // Check immediately
    checkForMatrixClient();

    // Set up interval to check every 500ms
    checkInterval = setInterval(checkForMatrixClient, 500);

    // Clean up interval on component unmount
    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [session.user.id]);

  // Calculate exponential backoff with jitter
  const calculateBackoff = (retry) => {
    const baseDelay = 1000; // 1 second
    const maxDelay = 10000; // 10 seconds
    const exponential = Math.min(maxDelay, baseDelay * Math.pow(2, retry));
    const jitter = 0.5 * exponential; // Add up to 50% jitter
    return exponential + (Math.random() * jitter);
  };

  // Set a timeout for bot response
  const setBotTimeout = (timeoutMs = 25000) => {
    // Clear any existing timeout
    if (botResponseTimeout) {
      clearTimeout(botResponseTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      if (waitingForBotResponse) {
        setWaitingForBotResponse(false);
        handleBotResponseTimeout();
      }
    }, timeoutMs);

    setBotResponseTimeout(timeout);
  };

  // Handle bot response timeout
  const handleBotResponseTimeout = async () => {
    // First, check if there are any messages in the room that we might have missed
    if (roomId && (globalClient || window.matrixClient)) {
      const matrixClient = globalClient || window.matrixClient;
      try {
        logger.info('[TelegramConnection] Timeout: Checking for missed messages');

        // Force a sync to get the latest messages
        try {
          await matrixClient.syncLeftRooms();
          await matrixClient.roomInitialSync(roomId);
        } catch (syncError) {
          logger.warn('[TelegramConnection] Error forcing sync:', syncError);
          // Continue anyway
        }

        // Check for messages in the room
        const room = matrixClient.getRoom(roomId);
        if (room) {
          const timeline = room.getLiveTimeline();
          const events = timeline.getEvents();

          // Log all messages for debugging
          for (const event of events) {
            if (event.getType() === 'm.room.message' && event.getSender() === TELEGRAM_BOT_USER_ID) {
              logger.info('[TelegramConnection] Timeout check found message:', event.getContent());

              // Process the message content
              const content = event.getContent();
              if (content && content.body) {
                // Check for verification code message - be very specific
                if (content.body.includes('Login code sent to') && step === 'phone_input') {
                  // Extract phone number
                  const phoneMatch = content.body.match(/Login code sent to ([+\d]+)/);
                  if (phoneMatch && phoneMatch[1]) {
                    // Store the formatted phone number
                    setPhoneNumber(phoneMatch[1]);

                    // Start verification code timer
                    startVerificationCodeTimer();

                    // Update toast
                    toast.success(`Verification code sent to ${phoneMatch[1]}`, { id: 'telegram-phone' });

                    // Force state update
                    setTimeout(() => {
                      setStep('code_input');
                      setLoading(false);
                      setWaitingForBotResponse(false);

                      // Log the state change
                      logger.info('[TelegramConnection] State updated by timeout handler: step=code_input, loading=false');
                    }, 100);

                    return;
                  }
                }

                // Check for error messages
                if (content.body && (
                  content.body.includes('Invalid phone') ||
                  content.body.includes('phone number is invalid') ||
                  content.body.includes('Invalid phone code')
                )) {
                  logger.error(`[TelegramConnection] Phone number error from timeout check: ${content.body}`);

                  // Update toast
                  toast.error('Invalid phone number format', { id: 'telegram-phone' });

                  // Update error message
                  setPhoneError('Invalid phone number format. Please include country code (e.g., +1 for US).');

                  // Reset state
                  setStep('phone_input');
                  setLoading(false);
                  setWaitingForBotResponse(false);

                  return;
                }
              }
            }
          }
        }

        // Check the room timeline again for additional messages
        if (room) {
          const timeline = room.getLiveTimeline();
          if (timeline) {
            const events = timeline.getEvents();

            // Check for messages from the bot
            for (const event of events) {
              if (event.getType() === 'm.room.message' && event.getSender() === TELEGRAM_BOT_USER_ID) {
                const content = event.getContent();
                logger.info('[TelegramConnection] Timeout check found message:', content);

                if (content.body && content.body.includes('You are already logged in as')) {
                  // Extract username if available
                  const usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
                  const username = usernameMatch ? usernameMatch[1] : null;

                  logger.info(`[TelegramConnection] Timeout check: User already logged in as @${username || 'unknown'}`);
                  handleLoginSuccess(roomId, username);
                  return;
                }
              }
            }
          }
        }
      } catch (error) {
        logger.warn('[TelegramConnection] Error checking for missed messages:', error);
        // Continue with normal timeout handling
      }
    }

    if (retryCount < 2) { // Allow for 3 total attempts (initial + 2 retries)
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);

      const backoffTime = calculateBackoff(nextRetry);
      try {
        toast.error(`No response from Telegram bot. Retrying in ${Math.round(backoffTime/1000)} seconds...`);
      } catch (toastError) {
        logger.warn('[TelegramConnection] Error showing toast:', toastError);
      }

      setTimeout(() => {
        // Retry the current step
        if (step === 'sending_login') {
          sendLoginCommand(matrixClient, roomId);
        } else if (step === 'phone_input') {
          // Just reset waiting state for phone input
          setWaitingForBotResponse(false);
          setLoading(false);
        } else if (step === 'code_input') {
          // Just reset waiting state for code input
          setWaitingForBotResponse(false);
          setLoading(false);
        }
      }, backoffTime);
    } else {
      // Max retries reached
      // Check if we have a room ID - if so, we might be already logged in
      if (roomId && step === 'sending_login') {
        logger.info('[TelegramConnection] Max retries reached but room exists, checking if already logged in');
        // Assume we might be already logged in and try to proceed
        try {
          toast.success('Looks like you might already be connected to Telegram! Proceeding...');
        } catch (toastError) {
          logger.warn('[TelegramConnection] Error showing toast:', toastError);
        }
        handleLoginSuccess(roomId);
      } else {
        try {
          toast.error('We had trouble connecting to Telegram. Please try again in a moment.');
        } catch (toastError) {
          logger.warn('[TelegramConnection] Error showing toast:', toastError);
        }
        setError('Connection issue. Please try again.');
        setStep('initial');
        setLoading(false);
      }
    }
  };

  // Start the Telegram connection process
  const startTelegramConnection = async () => {
    setLoading(true);
    setError(null);
    setRetryCount(0);

    // Show a loading message to the user
    // toast.loading('Initializing Telegram connection...', { id: 'telegram-connect' });

    // First check if we already have a Telegram account connected
    const existingTelegramAccount = accounts.find(account => account.platform === 'telegram' && account.status === 'active');
    if (existingTelegramAccount) {
      logger.info('[TelegramConnection] Telegram account already connected:', existingTelegramAccount);
      toast.success('Telegram is already connected!', { id: 'telegram-connect' });
      setStep('complete');
      setLoading(false);
      return;
    }

    // Use the global Matrix client
    let matrixClient = globalClient || window.matrixClient;

    // Check if Matrix client is initialized
    if (!matrixClient) {
      logger.error('[TelegramConnection] Matrix client not available after initialization attempt');
      toast.error('Matrix client not available. Please refresh and try again.', { id: 'telegram-connect' });
      setError('Matrix client not available. Please refresh the page and try again.');
      setStep('initial');
      setLoading(false);
      return;
    }

    logger.info('[TelegramConnection] Using Matrix client for Telegram connection');

    // Ensure client is ready
    try {
      // Simple test to see if client is functional
      const userId = matrixClient.getUserId();
      logger.info(`[TelegramConnection] Using Matrix client with user ID: ${userId}`);

      // Check sync state
      const syncState = matrixClient.getSyncState();
      logger.info(`[TelegramConnection] Matrix client sync state: ${syncState}`);

      // Allow both PREPARED and SYNCING states as valid for operations
      if (syncState !== 'PREPARED' && syncState !== 'SYNCING') {
        logger.warn('[TelegramConnection] Matrix client not fully synced, waiting...');
        toast.info('Waiting for Matrix client to sync...');

        // Wait for sync to complete (max 10 seconds)
        let syncCompleted = false;
        const syncTimeout = setTimeout(() => {
          if (!syncCompleted) {
            logger.warn('[TelegramConnection] Sync timeout, proceeding anyway');
          }
        }, 10000);

        try {
          await new Promise((resolve) => {
            const onSync = (state) => {
              if (state === 'PREPARED') {
                matrixClient.removeListener('sync', onSync);
                syncCompleted = true;
                clearTimeout(syncTimeout);
                resolve();
              }
            };

            matrixClient.on('sync', onSync);

            // Also resolve if already in PREPARED state
            if (matrixClient.getSyncState() === 'PREPARED') {
              matrixClient.removeListener('sync', onSync);
              syncCompleted = true;
              clearTimeout(syncTimeout);
              resolve();
            }

            // Set a timeout in case sync never completes
            setTimeout(() => {
              matrixClient.removeListener('sync', onSync);
              syncCompleted = true;
              clearTimeout(syncTimeout);
              resolve();
              logger.warn('[TelegramConnection] Sync timeout, continuing anyway');
            }, 10000); // 10 second timeout
          });
        } catch (syncError) {
          logger.error('[TelegramConnection] Error waiting for sync:', syncError);
          // Continue anyway
        }
      }
    } catch (error) {
      logger.error('[TelegramConnection] Matrix client not properly initialized:', error);
      setError('Matrix client not properly initialized. Please refresh the page and try again.');
      setStep('initial');
      setLoading(false);
      return;
    }

    setStep('creating_room');

    // Show a loading toast for room creation
    toast.loading('Creating secure chat room...', { id: 'telegram-room-creation' });

    try {
      // Use the global Matrix client
      const matrixClient = globalClient || window.matrixClient;

      if (!matrixClient) {
        throw new Error('Matrix client not available. Please refresh the page and try again.');
      }

      // Check if client is ready
      if (matrixClient.getSyncState() !== 'PREPARED' && matrixClient.getSyncState() !== 'SYNCING') {
        logger.warn(`[TelegramConnection] Matrix client sync state is ${matrixClient.getSyncState()}, but proceeding anyway`);
      }

      // Check if there's an existing Telegram room we can reuse
      logger.info('[TelegramConnection] Checking for existing Telegram rooms');

      let existingRoomId = null;

      // Get all rooms the user is in
      const rooms = matrixClient.getRooms();

      // Look for a room with the Telegram bot that we can reuse
      for (const room of rooms) {
        // Check if room has the Telegram bot
        const members = room.getJoinedMembers();
        const hasTelegramBot = members.some(member => member.userId === TELEGRAM_BOT_USER_ID);

        // Check if room has our custom state event
        let hasTelegramState = false;
        try {
          const stateEvent = room.currentState.getStateEvents('io.dailyfix.telegram', '');
          hasTelegramState = stateEvent && stateEvent.getContent().enabled === true;
        } catch (e) {
          // State event not found
        }

        if (hasTelegramBot && hasTelegramState) {
          existingRoomId = room.roomId;
          logger.info(`[TelegramConnection] Found existing Telegram room: ${existingRoomId}`);
          break;
        }
      }

      let createdRoomId;

      if (existingRoomId) {
        // Reuse existing room
        createdRoomId = existingRoomId;
        setRoomId(createdRoomId);

        logger.info('[TelegramConnection] Reusing existing Telegram room');
        toast.success('Reusing existing Telegram connection', { id: 'telegram-room-creation' });
      } else {
        // Create a new room for Telegram integration
        logger.info('[TelegramConnection] No existing room found, creating new room for Telegram integration');

        // Create room directly using the Matrix client
        const room = await matrixClient.createRoom({
        name: 'Telegram Login',
        topic: 'Telegram integration room',
        preset: 'private_chat',
        visibility: 'private',
        initial_state: [
          {
            type: 'm.room.history_visibility',
            content: { history_visibility: 'shared' }
          },
          {
            type: 'io.dailyfix.telegram',
            content: {
              enabled: true,
              bridge: 'telegram',
              homeserver: 'dfix-hsbridge.duckdns.org'
            }
          }
        ]
      });

        // Get the room ID from the newly created room
        createdRoomId = room.room_id;
        setRoomId(createdRoomId);

        logger.info('[TelegramConnection] Created room with ID:', createdRoomId);

        // Invite Telegram bot to the room
        logger.info('[TelegramConnection] Inviting Telegram bot to room');
        await matrixClient.invite(createdRoomId, TELEGRAM_BOT_USER_ID);

        // Update the toast to show success
        toast.success('Room created successfully!', { id: 'telegram-room-creation' });
      }

      logger.info('[TelegramConnection] Using Telegram bridge on https://dfix-hsbridge.duckdns.org');

      // Set up room listener for bot responses
      const onRoomEvent = (event, eventRoom) => {
        if (eventRoom.roomId === createdRoomId) {
          handleRoomEvent(event, eventRoom);
        }
      };

      matrixClient.on('Room.timeline', onRoomEvent);

      // Store the listener for cleanup
      setRoomListener(() => {
        matrixClient.removeListener('Room.timeline', onRoomEvent);
      });

      // Wait a moment for the room ID to be properly set in state
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send login command using the created room ID directly
      await sendLoginCommand(matrixClient, createdRoomId);
    } catch (error) {
      logger.error('[TelegramConnection] Error connecting to Telegram:', error);

      // Update the toast to show error
      toast.error('Failed to create room. Please try again.', { id: 'telegram-room-creation' });

      setError(error.message || 'Failed to connect to Telegram. Please try again.');
      setStep('initial');
      setLoading(false);
    }
  };

  // Send the login command to the bot
  const sendLoginCommand = async (matrixClient, roomId) => {
    // Show a loading toast for login command
    toast.loading('Connecting to Telegram bot...', { id: 'telegram-login-command' });
    if (!roomId) {
      logger.error('[TelegramConnection] Room ID not provided to sendLoginCommand');

      // Update the toast to show error
      toast.error('Room not created. Please try again.', { id: 'telegram-login-command' });

      setError('Room not created. Please try again.');
      setStep('initial');
      setLoading(false);
      return;
    }

    if (!matrixClient) {
      logger.error('[TelegramConnection] Matrix client not available in sendLoginCommand');

      // Update the toast to show error
      toast.error('Matrix client not available. Please refresh and try again.', { id: 'telegram-login-command' });

      setError('Matrix client not available. Please refresh the page and try again.');
      setStep('initial');
      setLoading(false);
      return;
    }

    // Double-check that the room exists
    try {
      const room = matrixClient.getRoom(roomId);
      if (!room) {
        logger.error(`[TelegramConnection] Room ${roomId} not found in client`);

        // Update the toast to show error
        toast.error('Room not found. Please try again.', { id: 'telegram-login-command' });

        setError('Room not found. Please try again.');
        setStep('initial');
        setLoading(false);
        return;
      }
    } catch (roomCheckError) {
      logger.error('[TelegramConnection] Error checking room:', roomCheckError);

      // Update the toast to show error
      toast.error('Error checking room. Please try again.', { id: 'telegram-login-command' });

      setError('Error checking room. Please try again.');
      setStep('initial');
      setLoading(false);
      return;
    }

    setStep('sending_login');
    setWaitingForBotResponse(true);

    try {
      // Set up room listener BEFORE checking for messages or sending commands
      if (!roomListener) {
        // Enhanced dedicated listener specifically for the login response message
        const onLoginResponseMessage = (event, eventRoom) => {
          // Only process events from our room
          if (!eventRoom || eventRoom.roomId !== roomId) return;

          // Only process message events from the Telegram bot
          if (event.getType() !== 'm.room.message' || event.getSender() !== TELEGRAM_BOT_USER_ID) return;

          const content = event.getContent();
          logger.info('[TelegramConnection] Login response listener caught message:', JSON.stringify(content, null, 2));

          // Critical check: Look for the "already logged in" message that's being missed
          if (content && content.body && content.body.includes('You are already logged in as')) {
            logger.info('[TelegramConnection] CRITICAL: Detected "already logged in" message in dedicated listener');

            // Extract username if available
            const usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
            const username = usernameMatch ? usernameMatch[1] : null;

            logger.info(`[TelegramConnection] User already logged in as @${username || 'unknown'}`);

            // Clear any response timeout
            if (botResponseTimeout) {
              clearTimeout(botResponseTimeout);
              setBotResponseTimeout(null);
            }

            // Reset waiting state
            setWaitingForBotResponse(false);

            // Handle login success immediately
            handleLoginSuccess(roomId, username);
          }
        };

        // Standard event listener (preserve existing functionality)
        const onRoomEvent = (event, eventRoom) => {
          // Log all events for debugging
          logger.info(`[TelegramConnection] Room event: ${event.getType()} from ${event.getSender()} in ${eventRoom?.roomId}`);
          logger.info(`[TelegramConnection] Event content:`, JSON.stringify(event.getContent(), null, 2));

          if (eventRoom.roomId === roomId) {
            // Log that we're processing an event for our room
            logger.info(`[TelegramConnection] Processing event for our room: ${event.getType()} from ${event.getSender()}`);
            handleRoomEvent(event, eventRoom);
          }
        };

        // Also add a specific handler for m.room.message events
        const onRoomMessage = (event, eventRoom) => {
          if (event.getType() === 'm.room.message' && eventRoom.roomId === roomId) {
            logger.info(`[TelegramConnection] Room message event from ${event.getSender()} in ${eventRoom.roomId}`);
            logger.info(`[TelegramConnection] Message content:`, JSON.stringify(event.getContent(), null, 2));

            // If this is from the Telegram bot, process it immediately
            if (event.getSender() === TELEGRAM_BOT_USER_ID) {
              logger.info(`[TelegramConnection] Bot message received, processing immediately`);

              // Also check here specifically for the "already logged in" message for redundancy
              const content = event.getContent();
              if (content && content.body && content.body.includes('You are already logged in as')) {
                logger.info('[TelegramConnection] CRITICAL: Detected "already logged in" in message handler');

                // Extract username if available
                const usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
                const username = usernameMatch ? usernameMatch[1] : null;

                logger.info(`[TelegramConnection] User already logged in as @${username || 'unknown'}`);

                // Clear any response timeout
                if (botResponseTimeout) {
                  clearTimeout(botResponseTimeout);
                  setBotResponseTimeout(null);
                }

                // Reset waiting state
                setWaitingForBotResponse(false);

                // Handle login success immediately
                handleLoginSuccess(roomId, username);
                return;
              }

              handleRoomEvent(event, eventRoom);
            }
          }
        };

        // We already have a dedicated login response handler defined above

        // Listen for all room events, not just timeline
        matrixClient.on('Room.timeline', onRoomEvent);
        matrixClient.on('Room.event', onRoomEvent);
        matrixClient.on('Room.timeline', onRoomMessage); // Add specific handler for messages
        matrixClient.on('Room.timeline', onLoginResponseMessage); // Add dedicated handler for login response

        // Store the listener for cleanup
        setRoomListener(() => {
          matrixClient.removeListener('Room.timeline', onRoomEvent);
          matrixClient.removeListener('Room.event', onRoomEvent);
          matrixClient.removeListener('Room.timeline', onRoomMessage);
          matrixClient.removeListener('Room.timeline', onLoginResponseMessage);
        });

        // Also add a direct event listener for the specific room
        try {
          const room = matrixClient.getRoom(roomId);
          if (room) {
            room.on('Room.timeline', onRoomMessage);
            room.on('Room.timeline', onLoginResponseMessage); // Add room-level dedicated handler

            // Add this to the cleanup function
            const originalCleanup = roomListener;
            setRoomListener(() => {
              if (originalCleanup) originalCleanup();
              room.removeListener('Room.timeline', onRoomMessage);
              room.removeListener('Room.timeline', onLoginResponseMessage);
            });
          }
        } catch (roomError) {
          logger.warn('[TelegramConnection] Error setting up room-specific listener:', roomError);
        }

        logger.info('[TelegramConnection] Room timeline listener set up');
      }

      // First check if there are any existing messages in the room
      try {
        // Force a sync to get the latest messages
        try {
          await matrixClient.syncLeftRooms();
          await matrixClient.roomInitialSync(roomId);
        } catch (syncError) {
          logger.warn('[TelegramConnection] Error forcing sync:', syncError);
          // Continue anyway
        }

        const timeline = matrixClient.getRoom(roomId)?.getLiveTimeline();
        if (timeline) {
          const events = timeline.getEvents();
          logger.info(`[TelegramConnection] Found ${events.length} events in timeline`);

          // Check for existing messages from the bot
          for (const event of events) {
            logger.info(`[TelegramConnection] Timeline event: ${event.getType()} from ${event.getSender()}`);

            if (event.getType() === 'm.room.message' && event.getSender() === TELEGRAM_BOT_USER_ID) {
              const content = event.getContent();
              logger.info('[TelegramConnection] Found bot message:', JSON.stringify(content, null, 2));

              if (content && (
                (content.body && content.body.includes('You are already logged in as')) ||
                (content.formatted_body && content.formatted_body.includes('You are already logged in as'))
              )) {
                // Extract username if available - check both body and formatted_body
                let usernameMatch = null;
                if (content.body) {
                  usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
                }
                if (!usernameMatch && content.formatted_body) {
                  usernameMatch = content.formatted_body.match(/logged in as @([\w\d_]+)/);
                }
                const username = usernameMatch ? usernameMatch[1] : null;

                logger.info(`[TelegramConnection] Found existing message: User already logged in as @${username || 'unknown'}`);
                try {
                  toast.success(`You are already logged in to Telegram as @${username || 'unknown'}!`);
                } catch (toastError) {
                  logger.warn('[TelegramConnection] Error showing toast:', toastError);
                  // Continue anyway
                }

                // Handle login success immediately
                handleLoginSuccess(roomId, username);
                return;
              }
            }
          }
        }
      } catch (timelineError) {
        logger.warn('[TelegramConnection] Error checking timeline:', timelineError);
        // Continue with login command anyway
      }

      // Send login command to the bot
      const command = 'login'; // Without the slash as per your instructions
      logger.info('[TelegramConnection] Sending login command to bot');

      // Send message directly using the Matrix client
      await matrixClient.sendMessage(roomId, {
        msgtype: 'm.text',
        body: command
      });

      // Update the toast to show success
      toast.success('Connected to Telegram bot!', { id: 'telegram-login-command' });

      // Wait a moment for the bot to respond
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for immediate response after sending the command
      try {
        // Force a sync to get the latest messages
        await matrixClient.syncLeftRooms();
        await matrixClient.roomInitialSync(roomId);

        // Get the room and check for messages
        const room = matrixClient.getRoom(roomId);
        if (room) {
          const timeline = room.getLiveTimeline();
          if (timeline) {
            const events = timeline.getEvents();
            logger.info(`[TelegramConnection] Post-send check found ${events.length} events in timeline`);

            // Check for messages from the bot
            for (const event of events) {
              if (event.getType() === 'm.room.message' && event.getSender() === TELEGRAM_BOT_USER_ID) {
                const content = event.getContent();
                logger.info('[TelegramConnection] Post-send check found bot message:', JSON.stringify(content, null, 2));

                // Check for already logged in message
                if (content && (
                  (content.body && content.body.includes('You are already logged in as')) ||
                  (content.formatted_body && content.formatted_body.includes('You are already logged in as'))
                )) {
                  // Extract username if available - check both body and formatted_body
                  let usernameMatch = null;
                  if (content.body) {
                    usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
                  }
                  if (!usernameMatch && content.formatted_body) {
                    usernameMatch = content.formatted_body.match(/logged in as @([\w\d_]+)/);
                  }
                  const username = usernameMatch ? usernameMatch[1] : null;

                  logger.info(`[TelegramConnection] Post-send check: User already logged in as @${username || 'unknown'}`);
                  handleLoginSuccess(roomId, username);
                  return;
                }

                // Check for phone number request
                if (content && content.body && content.body.includes('Please send your phone number')) {
                  logger.info('[TelegramConnection] Post-send check found phone number request - transitioning to phone input step');

                  // Update toast
                  toast.success('Ready for phone number input', { id: 'telegram-login-command' });

                  // Force state update
                  setTimeout(() => {
                    setStep('phone_input');
                    setLoading(false);

                    // Log the state change
                    logger.info('[TelegramConnection] State updated by post-send check: step=phone_input, loading=false');
                  }, 100);

                  return;
                }
              }
            }
          }
        }
      } catch (postSendCheckError) {
        logger.warn('[TelegramConnection] Error in post-send check:', postSendCheckError);
        // Continue with normal flow
      }

      // Set timeout for bot response
      setBotTimeout();

      try {
        toast.success('Connecting to Telegram...', { id: 'telegram-connecting' });
      } catch (toastError) {
        logger.warn('[TelegramConnection] Error showing toast:', toastError);
        // Continue anyway
      }

      // Immediately check for existing messages in the room
      try {
        // Get the room and check for messages
        const room = matrixClient.getRoom(roomId);
        if (room) {
          const timeline = room.getLiveTimeline();
          if (timeline) {
            const events = timeline.getEvents();
            logger.info(`[TelegramConnection] Immediate check found ${events.length} events in timeline`);

            // Check for messages from the bot
            for (const event of events) {
              if (event.getType() === 'm.room.message' && event.getSender() === TELEGRAM_BOT_USER_ID) {
                const content = event.getContent();
                logger.info('[TelegramConnection] Immediate check found bot message:', JSON.stringify(content, null, 2));

                // Check for already logged in message
                if (content.body && content.body.includes('You are already logged in as')) {
                  // Extract username if available
                  const usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
                  const username = usernameMatch ? usernameMatch[1] : null;

                  logger.info(`[TelegramConnection] Immediate check: User already logged in as @${username || 'unknown'}`);
                  handleLoginSuccess(roomId, username);
                  return;
                }

                // Check for phone number request
                if (content && content.body && content.body.includes('Please send your phone number')) {
                  logger.info('[TelegramConnection] Immediate check found phone number request - transitioning to phone input step');

                  // Update toast
                  toast.success('Ready for phone number input', { id: 'telegram-login-command' });

                  // Force state update
                  setTimeout(() => {
                    setStep('phone_input');
                    setLoading(false);

                    // Log the state change
                    logger.info('[TelegramConnection] State updated by immediate check: step=phone_input, loading=false');
                  }, 100);

                  return;
                }
              }
            }
          }
        }
      } catch (immediateCheckError) {
        logger.warn('[TelegramConnection] Error in immediate check:', immediateCheckError);
        // Continue with normal flow
      }

      // Add a safety timeout to check for messages after sending the login command
      setTimeout(async () => {
        try {
          // If we're still in the sending_login step after 3 seconds, check for messages manually
          if (step === 'sending_login' && loading) {
            logger.info('[TelegramConnection] Safety timeout: Checking for messages manually');

            // Force a sync to get the latest messages
            try {
              await matrixClient.syncLeftRooms();
              await matrixClient.roomInitialSync(roomId);
            } catch (syncError) {
              logger.warn('[TelegramConnection] Error forcing sync:', syncError);
              // Continue anyway
            }

            // Check for messages directly from the server
            try {
              const response = await matrixClient.http.authedRequest(
                undefined, "GET", "/rooms/" + encodeURIComponent(roomId) + "/messages",
                { limit: 20, dir: 'b' }
              );

              logger.info('[TelegramConnection] Direct API messages response:', JSON.stringify(response, null, 2));

              if (response && response.chunk && Array.isArray(response.chunk)) {
                for (const event of response.chunk) {
                  if (event.type === 'm.room.message' && event.sender === TELEGRAM_BOT_USER_ID) {
                    logger.info('[TelegramConnection] Found bot message via direct API:', JSON.stringify(event, null, 2));

                    // Check for various message types
                    if (event.content && event.content.body) {
                      const messageBody = event.content.body;

                      // Check for already logged in message
                      if (messageBody.includes('You are already logged in as')) {
                        // Extract username if available
                        const usernameMatch = messageBody.match(/logged in as @([\w\d_]+)/);
                        const username = usernameMatch ? usernameMatch[1] : null;

                        logger.info(`[TelegramConnection] Timeout check: User already logged in as @${username || 'unknown'}`);
                        handleLoginSuccess(roomId, username);
                        return;
                      }

                      // Check for phone number request
                      if (messageBody.includes('Please send your phone number') && step !== 'phone_input') {
                        logger.info('[TelegramConnection] Timeout check found phone number request');

                        // Update toast
                        toast.success('Ready for phone number input', { id: 'telegram-login-command' });

                        // Force state update
                        setStep('phone_input');
                        setLoading(false);

                        // Log the state change
                        logger.info('[TelegramConnection] State updated by timeout check: step=phone_input, loading=false');
                        return;
                      }

                      // Check for verification code request
                      if (messageBody.includes('Login code sent to') && step !== 'code_input') {
                        logger.info('[TelegramConnection] Timeout check found verification code request');

                        // Extract phone number from message for display
                        const phoneMatch = messageBody.match(/Login code sent to ([+\d]+)/);
                        if (phoneMatch && phoneMatch[1]) {
                          // Store the phone number for reference
                          setPhoneNumber(phoneMatch[1]);
                        }

                        // Start the verification code timer
                        startVerificationCodeTimer();

                        // Update toast
                        toast.success(`Verification code sent to ${phoneMatch && phoneMatch[1] ? phoneMatch[1] : 'your device'}`, { id: 'telegram-login-command' });

                        // Force state update
                        setStep('code_input');
                        setLoading(false);

                        // Log the state change
                        logger.info('[TelegramConnection] State updated by timeout check: step=code_input, loading=false');
                        return;
                      }
                    }
                  }
                }
              }
            } catch (apiError) {
              logger.warn('[TelegramConnection] Error fetching messages via direct API:', apiError);
              // Continue with normal check
            }

            // Start aggressive polling for the bot's response
            let pollCount = 0;
            const maxPolls = 10;
            const pollInterval = setInterval(async () => {
              try {
                pollCount++;
                logger.info(`[TelegramConnection] Polling for bot response (${pollCount}/${maxPolls})`);

                // Force a sync
                try {
                  await matrixClient.syncLeftRooms();
                  await matrixClient.roomInitialSync(roomId);
                } catch (syncError) {
                  logger.warn('[TelegramConnection] Error forcing sync during polling:', syncError);
                }

                // Check for messages directly
                try {
                  const response = await matrixClient.http.authedRequest(
                    undefined, "GET", "/rooms/" + encodeURIComponent(roomId) + "/messages",
                    { limit: 20, dir: 'b' }
                  );

                  if (response && response.chunk && Array.isArray(response.chunk)) {
                    for (const event of response.chunk) {
                      if (event.type === 'm.room.message' && event.sender === TELEGRAM_BOT_USER_ID) {
                        logger.info('[TelegramConnection] Polling found bot message:', JSON.stringify(event, null, 2));

                        if (event.content && (
                          (event.content.body && event.content.body.includes('You are already logged in as')) ||
                          (event.content.formatted_body && event.content.formatted_body.includes('You are already logged in as'))
                        )) {
                          // Extract username if available - check both body and formatted_body
                          let usernameMatch = null;
                          if (event.content.body) {
                            usernameMatch = event.content.body.match(/logged in as @([\w\d_]+)/);
                          }
                          if (!usernameMatch && event.content.formatted_body) {
                            usernameMatch = event.content.formatted_body.match(/logged in as @([\w\d_]+)/);
                          }
                          const username = usernameMatch ? usernameMatch[1] : null;

                          logger.info(`[TelegramConnection] Polling found: User already logged in as @${username || 'unknown'}`);
                          clearInterval(pollInterval);
                          handleLoginSuccess(roomId, username);
                          return;
                        }
                      }
                    }
                  }
                } catch (apiError) {
                  logger.warn('[TelegramConnection] Error fetching messages during polling:', apiError);
                }

                // If we've reached the maximum number of polls, assume the user is already logged in
                if (pollCount >= maxPolls) {
                  clearInterval(pollInterval);
                  logger.info('[TelegramConnection] Maximum polls reached, assuming user is already logged in');
                  toast.success('Connecting to Telegram...');
                  handleLoginSuccess(roomId);
                }
              } catch (error) {
                logger.warn('[TelegramConnection] Error during polling:', error);
                clearInterval(pollInterval);
              }
            }, 1000); // Poll every second

            // Check for all messages in the room
            logger.info('[TelegramConnection] Timeout: Checking for missed messages');
            const room = matrixClient.getRoom(roomId);
            if (room) {
              const timeline = room.getLiveTimeline();
              if (timeline) {
                const events = timeline.getEvents();

                // Log all messages for debugging
                for (const event of events) {
                  if (event.getType() === 'm.room.message' && event.getSender() === TELEGRAM_BOT_USER_ID) {
                    logger.info('[TelegramConnection] Timeout check found message:', event.getContent());

                    // Process the message content
                    const content = event.getContent();
                    if (content && content.body) {
                      // Check for login code message
                      if (content.body.includes('Login code sent to') && step !== 'code_input') {
                        // Extract phone number
                        const phoneMatch = content.body.match(/Login code sent to ([+\d]+)/);
                        if (phoneMatch && phoneMatch[1]) {
                          setPhoneNumber(phoneMatch[1]);
                        }

                        // Start verification code timer
                        startVerificationCodeTimer();

                        // Update UI
                        setStep('code_input');
                        setLoading(false);

                        logger.info('[TelegramConnection] Timeout check: Transitioning to code input step');
                        return;
                      }

                      // Check for success message
                      if ((content.body.includes('Successfully logged in as') || content.body.includes('authentication successful'))) {
                        // Extract username if available
                        const usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
                        const username = usernameMatch ? usernameMatch[1] : null;

                        logger.info(`[TelegramConnection] Timeout check: Login successful as @${username || 'unknown'}`);
                        handleLoginSuccess(roomId, username);
                        return;
                      }
                    }
                  }
                }
              }
            }

            // If we still haven't found any relevant messages, provide a fallback
            logger.info('[TelegramConnection] Safety timeout: No relevant messages found');

            // If we're in the connecting state, assume success as a last resort
            if (step === 'connecting') {
              logger.info('[TelegramConnection] Safety timeout: Assuming login success');
              toast.success('Connecting to Telegram...');
              handleLoginSuccess(roomId);
            } else {
              // Otherwise, go back to the appropriate step based on current state
              logger.info('[TelegramConnection] Safety timeout: Resetting to appropriate step');
              if (step === 'sending_login') {
                setStep('initial');
                setLoading(false);
                toast.error('Connection timed out. Please try again.');
              }
            }
          }
        } catch (error) {
          logger.warn('[TelegramConnection] Error in safety timeout check:', error);
          // Continue anyway
        }
      }, 3000); // 3 second safety timeout

      // We've already sent the login command above
    } catch (error) {
      logger.error('[TelegramConnection] Error connecting to Telegram:', error);
      setError(error.message || 'Failed to connect to Telegram. Please try again.');
      setStep('initial');
      setLoading(false);
    }
  };

  const handleRoomEvent = (event, room) => {
    // Log all events for debugging
    logger.info(`[TelegramConnection] Processing event: ${event.getType()} from ${event.getSender()} in ${room.roomId}`);
    logger.info(`[TelegramConnection] Event content:`, JSON.stringify(event.getContent(), null, 2));

    try {
      // Process ALL events from the Telegram bot, not just messages
      if (event.getSender() === TELEGRAM_BOT_USER_ID) {
        // Clear any pending timeout since we got a response from the bot
        if (botResponseTimeout) {
          logger.info('[TelegramConnection] Clearing bot response timeout');
          clearTimeout(botResponseTimeout);
          setBotResponseTimeout(null);
        }

        // Reset waiting state
        setWaitingForBotResponse(false);
      }

      // Check if this is a message event
      if (event.getType() === 'm.room.message') {
        // Only process messages from the Telegram bot
        if (event.getSender() !== TELEGRAM_BOT_USER_ID) {
          logger.info(`[TelegramConnection] Ignoring message from non-bot sender: ${event.getSender()}`);
          return;
        }

        const content = event.getContent();
        logger.info('[TelegramConnection] Received message from Telegram bot:', JSON.stringify(content, null, 2));
        logger.info(`[TelegramConnection] Message type: ${content.msgtype}`);

        // HIGHEST PRIORITY: Check for already logged in message - check in both body and formatted_body
        if (content && (
          (content.body && content.body.includes('You are already logged in as')) ||
          (content.formatted_body && content.formatted_body.includes('You are already logged in as'))
        )) {
          logger.info('[TelegramConnection] DETECTED ALREADY LOGGED IN MESSAGE');

          // Extract username if available - check both body and formatted_body
          let usernameMatch = null;
          if (content.body) {
            usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
          }
          if (!usernameMatch && content.formatted_body) {
            usernameMatch = content.formatted_body.match(/logged in as @([\w\d_]+)/);
          }
          const username = usernameMatch ? usernameMatch[1] : null;

          logger.info(`[TelegramConnection] User already logged in as @${username || 'unknown'}`);
          try {
            toast.success(`You are already logged in to Telegram as @${username || 'unknown'}!`);
          } catch (toastError) {
            logger.warn('[TelegramConnection] Error showing toast:', toastError);
          }

          // Handle login success immediately
          handleLoginSuccess(room.roomId, username);
          return;
        }

        // Check for other success messages
        if (content && content.body && (content.body.includes('Successfully logged in as') || content.body.includes('authentication successful'))) {
          // Extract username if available
          const usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
          const username = usernameMatch ? usernameMatch[1] : null;

          if (username) {
            logger.info(`[TelegramConnection] User successfully logged in as @${username}`);
          }

          try {
            toast.success(`Telegram login successful${username ? ` as @${username}` : ''}!`);
          } catch (toastError) {
            logger.warn('[TelegramConnection] Error showing toast:', toastError);
          }

          handleLoginSuccess(room.roomId, username);
          return;
        }

        // Check for phone number request
        if (content && content.body && content.body.includes('Please send your phone number')) {
          logger.info('[TelegramConnection] Bot requested phone number - transitioning to phone input step');

          // Update toast
          toast.success('Ready for phone number input', { id: 'telegram-login-command' });

          // Force state update with a small delay to ensure it takes effect
          setTimeout(() => {
            setStep('phone_input');
            setLoading(false);

            // Log the state change
            logger.info('[TelegramConnection] State updated: step=phone_input, loading=false');
          }, 100);

          return;
        }

        // Check for verification code request
        if (content && content.body && content.body.includes('Login code sent to')) {
          logger.info('[TelegramConnection] Bot sent verification code');
          // Extract phone number from message for display
          const phoneMatch = content.body.match(/Login code sent to ([+\d]+)/);
          if (phoneMatch && phoneMatch[1]) {
            // Store the phone number for reference
            setPhoneNumber(phoneMatch[1]);
          }

          // Start the verification code timer
          startVerificationCodeTimer();

          // Update toast
          toast.success(`Verification code sent to ${phoneMatch && phoneMatch[1] ? phoneMatch[1] : 'your device'}`, { id: 'telegram-login-command' });

          // Force state update with a small delay to ensure it takes effect
          setTimeout(() => {
            setStep('code_input');
            setLoading(false);

            // Log the state change
            logger.info('[TelegramConnection] State updated: step=code_input, loading=false');
          }, 100);

          return;
        }

        // Check for login failure message
        if (content && content.body && (
          content.body.includes('Invalid code') ||
          content.body.includes('Code expired') ||
          content.body.includes('failed')
        )) {
          if (step === 'code_input') {
            setCodeError('Invalid or expired verification code. Please try again.');
          } else {
            setError('Login failed. Please try again.');
            setStep('initial');
          }
          setLoading(false);
          return;
        }
      }
    } catch (eventError) {
      logger.error('[TelegramConnection] Error processing event:', eventError);
    }
  };

  // Start the verification code timer
  const startVerificationCodeTimer = () => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Reset time to 3 minutes
    setTimeRemaining(180);

    // Start countdown
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Format time remaining as MM:SS
  const formatTimeRemaining = () => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Submit phone number to the bot
  const submitPhoneNumber = async () => {
    // Validate phone number with more precise checks
    if (!countryCode || countryCode === '+') {
      setPhoneError('Please enter a country code (e.g., +1 for US)');
      return;
    }

    if (!phoneNumber || phoneNumber.trim() === '') {
      setPhoneError('Please enter your phone number');
      return;
    }

    // Ensure country code starts with +
    let formattedCountryCode = countryCode;
    if (!formattedCountryCode.startsWith('+')) {
      formattedCountryCode = '+' + formattedCountryCode;
    }

    // Validate phone number format
    const fullPhoneNumber = `${formattedCountryCode}${phoneNumber}`;
    const phoneRegex = /^\+[1-9]\d{1,14}$/; // E.164 format

    if (!phoneRegex.test(fullPhoneNumber)) {
      setPhoneError('Invalid phone number format. Please enter a valid international number with country code.');
      return;
    }

    // Clear any previous errors
    setPhoneError(null);
    setLoading(true);
    setWaitingForBotResponse(true);

    // Show a loading toast
    toast.loading('Sending phone number...', { id: 'telegram-phone' });

    try {
      // Use the global Matrix client
      const matrixClient = globalClient || window.matrixClient;

      if (!matrixClient || !roomId) {
        throw new Error('Matrix client or room ID not available');
      }

      // Use the already formatted phone number from validation
      // const fullPhoneNumber is already defined above

      // Send the phone number to the bot
      logger.info('[TelegramConnection] Sending phone number to bot');

      await matrixClient.sendMessage(roomId, {
        msgtype: 'm.text',
        body: fullPhoneNumber
      });

      toast.success('Phone number sent. Waiting for verification code...', { id: 'telegram-phone' });

      // Start polling for response immediately
      let pollCount = 0;
      const maxPolls = 30; // Poll for 15 seconds (30 * 500ms)
      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          logger.info(`[TelegramConnection] Polling for verification code message (${pollCount}/${maxPolls})`);

          // Check for messages in the room
          const room = matrixClient.getRoom(roomId);
          if (room) {
            const timeline = room.getLiveTimeline();
            const events = timeline.getEvents();

            // Look for the most recent messages from the bot
            for (let i = events.length - 1; i >= Math.max(0, events.length - 10); i--) {
              const event = events[i];
              if (event.getType() === 'm.room.message' && event.getSender() === TELEGRAM_BOT_USER_ID) {
                const content = event.getContent();

                // Check for verification code message
                if (content.body && content.body.includes('Login code sent to')) {
                  // Extract phone number from message for display
                  const phoneMatch = content.body.match(/Login code sent to ([+\d]+)/);
                  if (phoneMatch && phoneMatch[1]) {
                    // Store the phone number for reference
                    setPhoneNumber(phoneMatch[1]);
                  }

                  logger.info('[TelegramConnection] Found verification code message:', content.body);
                  clearInterval(pollInterval);

                  // Start the verification code timer
                  startVerificationCodeTimer();

                  // Update toast
                  toast.success(`Verification code sent to ${phoneMatch && phoneMatch[1] ? phoneMatch[1] : 'your device'}`, { id: 'telegram-phone' });

                  // Force state update with a small delay to ensure it takes effect
                  setTimeout(() => {
                    setStep('code_input');
                    setLoading(false);
                    setWaitingForBotResponse(false);

                    // Log the state change
                    logger.info('[TelegramConnection] State updated by phone polling: step=code_input, loading=false');
                  }, 100);

                  return;
                }

                // Check for error message - be very specific about the error message
                if (content.body && (
                  content.body.includes('Invalid phone') ||
                  content.body.includes('phone number is invalid') ||
                  content.body.includes('Invalid phone code')
                )) {
                  logger.error(`[TelegramConnection] Phone number error: ${content.body}`);
                  clearInterval(pollInterval);
                  toast.error('Invalid phone number format', { id: 'telegram-phone' });
                  setPhoneError('Invalid phone number format. Please include country code (e.g., +1 for US).');
                  setLoading(false);
                  setWaitingForBotResponse(false);
                  return;
                }
              }
            }
          }

          // If we've reached the maximum number of polls, stop polling
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            logger.info('[TelegramConnection] No verification code message found after maximum polls');
            toast.error('No response from Telegram. Please try again.', { id: 'telegram-phone' });
            setLoading(false);
            setWaitingForBotResponse(false);
          }
        } catch (error) {
          logger.error('[TelegramConnection] Error polling for verification code message:', error);
        }
      }, 500); // Poll every 500ms

      // Set timeout for bot response as a fallback
      setBotTimeout();
    } catch (error) {
      logger.error('[TelegramConnection] Error sending phone number:', error);
      setPhoneError('Failed to send phone number. Please try again.');
      setLoading(false);
      setWaitingForBotResponse(false);
      toast.error('Failed to send phone number', { id: 'telegram-phone' });
    }
  };

  // Submit verification code to the bot
  const submitVerificationCode = async () => {
    // Validate verification code
    if (!verificationCode || verificationCode.trim() === '') {
      setCodeError('Please enter the verification code');
      return;
    }

    // Clear any previous errors
    setCodeError(null);
    setLoading(true);
    setWaitingForBotResponse(true);

    // Show a loading toast
    toast.loading('Verifying code...', { id: 'telegram-verification' });

    try {
      // Use the global Matrix client
      const matrixClient = globalClient || window.matrixClient;

      if (!matrixClient || !roomId) {
        throw new Error('Matrix client or room ID not available');
      }

      // Send the verification code to the bot
      logger.info('[TelegramConnection] Sending verification code to bot');
      await matrixClient.sendMessage(roomId, {
        msgtype: 'm.text',
        body: verificationCode.trim()
      });

      // Set timeout for bot response
      setBotTimeout();

      // Start polling for response
      let pollCount = 0;
      const maxPolls = 20; // Poll for 10 seconds (20 * 500ms)
      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          logger.info(`[TelegramConnection] Polling for verification response (${pollCount}/${maxPolls})`);

          // Check for messages in the room
          const room = matrixClient.getRoom(roomId);
          if (room) {
            const timeline = room.getLiveTimeline();
            const events = timeline.getEvents();

            // Look for the most recent messages from the bot
            for (let i = events.length - 1; i >= 0; i--) {
              const event = events[i];
              if (event.getType() === 'm.room.message' && event.getSender() === TELEGRAM_BOT_USER_ID) {
                const content = event.getContent();

                // Check for success message
                if (content.body && (content.body.includes('Successfully logged in as') ||
                                     content.body.includes('authentication successful'))) {
                  // Extract username if available
                  const usernameMatch = content.body.match(/logged in as @([\w\d_]+)/);
                  const username = usernameMatch ? usernameMatch[1] : null;

                  logger.info(`[TelegramConnection] Verification successful: ${content.body}`);
                  clearInterval(pollInterval);
                  toast.success('Verification successful!', { id: 'telegram-verification' });
                  handleLoginSuccess(roomId, username);
                  return;
                }

                // Check for specific error messages related to verification code
                if (content.body && (
                  content.body.includes('Invalid code') ||
                  content.body.includes('code is invalid') ||
                  content.body.includes('code expired') ||
                  (content.body.includes('error') && content.body.includes('code'))
                )) {
                  logger.error(`[TelegramConnection] Verification failed: ${content.body}`);
                  clearInterval(pollInterval);

                  // Show specific error message based on the response
                  if (content.body.includes('expired')) {
                    toast.error('Verification code expired', { id: 'telegram-verification' });
                    setCodeError('Verification code expired. Please request a new code.');
                  } else {
                    toast.error('Invalid verification code', { id: 'telegram-verification' });
                    setCodeError('Invalid verification code. Please try again.');
                  }

                  setLoading(false);
                  setWaitingForBotResponse(false);
                  return;
                }
              }
            }
          }

          // If we've reached the maximum number of polls, transition to connecting state
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            logger.info('[TelegramConnection] No immediate response from bot after sending verification code, continuing to wait');
            toast.loading('Waiting for Telegram to respond...', { id: 'telegram-verification' });
            setStep('connecting');
          }
        } catch (error) {
          logger.error('[TelegramConnection] Error polling for verification response:', error);
        }
      }, 500); // Poll every 500ms

      toast.success('Verification code sent. Completing login...');
      setStep('connecting');
    } catch (error) {
      logger.error('[TelegramConnection] Error sending verification code:', error);
      setCodeError('Failed to send verification code. Please try again.');
      setLoading(false);
      setWaitingForBotResponse(false);
      toast.error('Failed to send verification code', { id: 'telegram-verification' });
    }
  };

  const handleLoginSuccess = async (roomId, username = null) => {
    logger.info('[TelegramConnection] Telegram login successful' + (username ? ` as @${username}` : ''));

    // Dismiss any existing toasts
    try {
      toast.dismiss('telegram-connecting');
    } catch (toastError) {
      logger.warn('[TelegramConnection] Error dismissing toast:', toastError);
      // Continue anyway
    }

    // Clear any timers
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (botResponseTimeout) {
      clearTimeout(botResponseTimeout);
      setBotResponseTimeout(null);
    }

    // Clean up room listener if exists
    if (roomListener) {
      roomListener();
    }

    // Update loading state immediately
    setLoading(false);
    setWaitingForBotResponse(false);

    // Update accounts in Redux store
    const telegramAccount = {
      id: 'telegram',
      platform: 'telegram',
      name: 'Telegram',
      status: 'active',
      roomId: roomId, // Store the room ID for future reference
      username: username, // Store the Telegram username if available
      connectedAt: new Date().toISOString()
    };

    const updatedAccounts = [...accounts];
    const existingIndex = updatedAccounts.findIndex(acc => acc.platform === 'telegram');

    if (existingIndex >= 0) {
      updatedAccounts[existingIndex] = telegramAccount;
    } else {
      updatedAccounts.push(telegramAccount);
    }

    // Dispatch to update accounts in Redux store
    dispatch(updateAccounts(updatedAccounts));

    // Also update the platform state to trigger UI updates
    try {
      // Force a refresh of the platform state
      dispatch({ type: 'platform/setActivePlatform', payload: 'telegram' });
      dispatch({ type: 'platform/refreshContacts' });
      logger.info('[TelegramConnection] Updated platform state in Redux');
    } catch (platformError) {
      logger.error('[TelegramConnection] Error updating platform state:', platformError);
      // Continue anyway
    }

    // Store Telegram connection info in IndexedDB for persistence
    try {
      const userId = session?.user?.id;
      if (userId) {
        // Save to IndexedDB
        await saveToIndexedDB(userId, {
          telegram: true,
          telegramRoomId: roomId,
          telegramConnectedAt: new Date().toISOString()
        });

        // Also save to localStorage as fallback
        const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
        connectionStatus.telegram = true;
        connectionStatus.telegramRoomId = roomId;
        localStorage.setItem('dailyfix_connection_status', JSON.stringify(connectionStatus));
      }

      // Initialize room list manager to start syncing rooms immediately
      const matrixClient = window.matrixClient;
      if (matrixClient) {
        try {
          // Check if roomListManager is available
          if (!roomListManager) {
            logger.warn('[TelegramConnection] Room list manager not available, trying to initialize');
            // Try to import it dynamically
            if (typeof window !== 'undefined' && window.roomListManager) {
              const dynamicRoomListManager = window.roomListManager;
              // This will start syncing Telegram rooms in the background
              dynamicRoomListManager.initRoomList(
                matrixClient.getUserId(),
                matrixClient,
                { filters: { platform: 'telegram' } }
              );

              // Force an immediate sync
              dynamicRoomListManager.syncRooms(matrixClient.getUserId(), true);
              logger.info('[TelegramConnection] Started syncing Telegram rooms with dynamic manager');
            } else {
              logger.error('[TelegramConnection] Room list manager not available globally');
            }
          } else {
            // This will start syncing Telegram rooms in the background
            roomListManager.initRoomList(
              matrixClient.getUserId(),
              matrixClient,
              { filters: { platform: 'telegram' } }
            );

            // Force an immediate sync
            roomListManager.syncRooms(matrixClient.getUserId(), true);
            logger.info('[TelegramConnection] Started syncing Telegram rooms');
          }
        } catch (syncError) {
          logger.error('[TelegramConnection] Error syncing rooms:', syncError);
          // Continue anyway
        }
      } else {
        logger.warn('[TelegramConnection] Matrix client not available for room syncing');
      }
    } catch (error) {
      logger.error('[TelegramConnection] Error saving Telegram connection status:', error);
    }

    setStep('complete');
    try {
      toast.success(username
        ? `Telegram connected successfully as @${username}! 🎉`
        : 'Telegram connected successfully! 🎉');
    } catch (toastError) {
      logger.warn('[TelegramConnection] Error showing success toast:', toastError);
      // Continue anyway
    }

    // Notify parent component
    if (onComplete) {
      onComplete(telegramAccount);
    }
  };

  const renderContent = () => {
    switch (step) {
      case 'initial':
        return (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <FaTelegram className="text-blue-500 text-6xl" />
            </div>
            <h3 className="text-xl font-medium text-white mb-6">Connect to Telegram</h3>
            <p className="text-gray-300 mb-6">
              Connect your Telegram account to access your chats directly in DailyFix.
            </p>
            <div className="bg-blue-900/30 text-blue-300 p-4 rounded-lg mb-6 text-sm text-left">
              <p className="flex items-start">
                <FiAlertTriangle className="text-blue-400 mt-1 mr-2 flex-shrink-0" />
                <span>Logging in grants the bridge full access to your Telegram account. Your data is end-to-end encrypted and secure.</span>
              </p>
            </div>
            {globalClient || window.matrixClient || (() => {
              // Check if we have credentials in any storage
              try {
                // Check custom localStorage
                const localStorageKey = `dailyfix_connection_${session.user.id}`;
                const localStorageData = localStorage.getItem(localStorageKey);
                if (localStorageData) {
                  const parsedData = JSON.parse(localStorageData);
                  if (parsedData.matrix_credentials && parsedData.matrix_credentials.accessToken) {
                    return true;
                  }
                }

                // Check Element-style localStorage
                if (localStorage.getItem('mx_access_token')) {
                  return true;
                }

                // Check initialization flags
                if (localStorage.getItem('matrix_client_initialized') === 'true') {
                  return true;
                }

                return false;
              } catch (e) {
                return false;
              }
            })() ? (
              <button
                onClick={startTelegramConnection}
                disabled={loading || (matrixSyncState !== 'PREPARED' && matrixSyncState !== 'SYNCING' &&
                                    localStorage.getItem('matrix_sync_state') !== 'PREPARED' &&
                                    localStorage.getItem('matrix_sync_state') !== 'SYNCING')}
                className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <FiLoader className="animate-spin mr-2" />
                    Connecting...
                  </span>
                ) : (matrixSyncState !== 'PREPARED' && matrixSyncState !== 'SYNCING' &&
                      localStorage.getItem('matrix_sync_state') !== 'PREPARED' &&
                      localStorage.getItem('matrix_sync_state') !== 'SYNCING') ? (
                  <span className="flex items-center justify-center">
                    <FiLoader className="animate-spin mr-2" />
                    Preparing Connection...
                  </span>
                ) : (
                  'Connect Telegram'
                )}
              </button>
            ) : (
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <FiLoader className="animate-spin text-blue-500 text-2xl" />
                </div>
                <p className="text-gray-300 text-sm">
                  Initializing Matrix client... Please wait.
                </p>
                <p className="text-gray-400 text-xs mt-2">
                  This may take a moment to establish a secure connection.
                </p>
              </div>
            )}
          </div>
        );

      case 'creating_room':
        return (
          <div className="text-center">
            <h3 className="text-xl font-medium text-white mb-6">Setting Up Telegram</h3>
            <div className="flex justify-center mb-6">
              <FiLoader className="animate-spin text-blue-500 text-4xl" />
            </div>
            <p className="text-gray-300">
              Creating a secure room for Telegram integration...
            </p>
          </div>
        );

      case 'sending_login':
        return (
          <div className="text-center">
            <h3 className="text-xl font-medium text-white mb-6">Connecting to Telegram</h3>
            <div className="flex justify-center mb-6">
              <FiLoader className="animate-spin text-blue-500 text-4xl" />
            </div>
            <p className="text-gray-300">
              Initializing Telegram connection...
            </p>
          </div>
        );

      case 'phone_input':
        return (
          <div className="text-center">
            <h3 className="text-xl font-medium text-white mb-6">Enter Your Phone Number</h3>
            <div className="mb-6">
              <p className="text-gray-300 mb-4 text-left">
                Please enter your phone number with country code to connect your Telegram account.
              </p>

              <div className="flex mb-2">
                <div className="w-1/3 pr-2">
                  <input
                    type="text"
                    placeholder="+1"
                    value={countryCode}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || value === '+' || /^\+\d*$/.test(value)) {
                        setCountryCode(value);
                      }
                    }}
                    className="w-full bg-neutral-800 text-white rounded-lg border-1 border-white/70 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="w-2/3">
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={phoneNumber}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^\d*$/.test(value)) {
                        setPhoneNumber(value);
                      }
                    }}
                    className="w-full bg-neutral-800 text-white rounded-lg border-1 border-white/70 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {phoneError && (
                <div className="text-red-400 text-sm text-left mt-2">
                  {phoneError}
                </div>
              )}

              <div className="bg-blue-900/30 text-blue-300 p-4 rounded-lg mt-4 text-sm text-left">
                <p className="flex items-start">
                  <FiAlertTriangle className="text-blue-400 mt-1 mr-2 flex-shrink-0" />
                  <span>Logging in grants the bridge full access to your Telegram account. Your data is end-to-end encrypted and secure.</span>
                </p>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setStep('initial');
                  setPhoneError(null);
                }}
                className="flex-1 py-3 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors"
              >
                Back
              </button>
              <button
                onClick={submitPhoneNumber}
                disabled={loading}
                className="flex-1 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <FiLoader className="animate-spin mr-2" />
                    Sending...
                  </span>
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          </div>
        );

      case 'code_input':
        return (
          <div className="text-center">
            <h3 className="text-xl font-medium text-white mb-6">Enter Verification Code</h3>
            <div className="mb-6">
              <div className="flex items-center justify-center mb-4">
                <FiClock className="text-blue-500 mr-2" />
                <div className="text-blue-300 font-mono">
                  {formatTimeRemaining()}
                </div>
              </div>

              <p className="text-gray-300 mb-4 text-left">
                A verification code has been sent to your Telegram app. Please enter it below.
              </p>

              <div className="mb-2">
                <input
                  type="text"
                  placeholder="Verification code"
                  value={verificationCode}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^\d*$/.test(value) && value.length <= 5) {
                      setVerificationCode(value);
                    }
                  }}
                  className="w-full bg-neutral-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl tracking-widest"
                  maxLength={5}
                />
              </div>

              {codeError && (
                <div className="text-red-400 text-sm text-left mt-2">
                  {codeError}
                </div>
              )}

              <div className="bg-neutral-800 p-4 rounded-lg mt-4 text-sm">
                <p className="text-gray-300 mb-2">
                  <strong>Check your Telegram app</strong> for the verification code.
                </p>
                <p className="text-gray-400 mb-3">
                  If you don't receive a code, make sure you've entered the correct phone number.
                </p>
                <button
                  onClick={() => {
                    // Go back to phone input step to request a new code
                    setStep('phone_input');
                    setCodeError(null);
                    setVerificationCode('');
                    toast.info('Enter your phone number again to request a new code');
                  }}
                  className="text-blue-400 hover:text-blue-300 underline text-sm flex items-center mx-auto"
                >
                  <FiRefreshCw className="mr-1" /> Request New Code
                </button>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setStep('phone_input');
                  setCodeError(null);
                  if (timerRef.current) {
                    clearInterval(timerRef.current);
                  }
                }}
                className="flex-1 py-3 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors"
              >
                Back
              </button>
              <button
                onClick={submitVerificationCode}
                disabled={loading || timeRemaining === 0}
                className="flex-1 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <FiLoader className="animate-spin mr-2" />
                    Verifying...
                  </span>
                ) : timeRemaining === 0 ? (
                  'Code Expired'
                ) : (
                  'Verify'
                )}
              </button>
            </div>
          </div>
        );

      case 'connecting':
        return (
          <div className="text-center">
            <h3 className="text-xl font-medium text-white mb-6">Completing Setup</h3>
            <div className="flex justify-center mb-6">
              <FiLoader className="animate-spin text-blue-500 text-4xl" />
            </div>
            <p className="text-gray-300">
              Finalizing your Telegram connection...
            </p>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <FiCheck className="text-green-400 text-4xl" />
            </div>
            <h3 className="text-xl font-medium text-white mb-6">Telegram Connected!</h3>
            <div className="bg-green-900/30 text-green-400 p-4 rounded-lg mb-6">
              <p>Your Telegram account has been successfully connected to DailyFix.</p>
            </div>
            <button
              onClick={onComplete}
              className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Continue
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // Show toast notification for errors
  useEffect(() => {
    if (error) {
      toast.error(error, {
        duration: 5000,
        position: 'bottom-right',
        style: {
          borderRadius: '10px',
          background: '#333',
          color: '#fff',
        },
      });
    }
  }, [error]);

  // Set the connecting_to_telegram flag when component mounts
  useEffect(() => {
    // Set flag to indicate we're connecting to Telegram
    sessionStorage.setItem('connecting_to_telegram', 'true');
    logger.info('[TelegramConnection] Set connecting_to_telegram flag');

    return () => {
      // Clear flag when component unmounts
      if (step !== 'complete') {
        sessionStorage.removeItem('connecting_to_telegram');
        logger.info('[TelegramConnection] Cleared connecting_to_telegram flag');
      }
    };
  }, [step]);

  return (
    // Wrap the component with MatrixInitializer to ensure Matrix is initialized
    // The forceInitialize prop ensures Matrix is initialized even if the flag is not set
    <MatrixInitializer forceInitialize={true}>
      <div className="bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-auto">
        {renderContent()}

        {step !== 'complete' && (
          <button
            onClick={onCancel}
            className="w-full mt-4 py-2 bg-transparent border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </MatrixInitializer>
  );
};

export default TelegramConnection;
