import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import * as matrixSdk from 'matrix-js-sdk';
import matrixClientManager from '../utils/matrixClientManager';
import roomListManager from '../utils/roomListManager';
import { fetchMatrixCredentials, setClientInitialized, setSyncState } from '../store/slices/matrixSlice';
import logger from '../utils/logger';

// Create context
const MatrixClientContext = createContext(null);

// Provider component
export const MatrixClientProvider = ({ children }) => {
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const { credentials, syncState } = useSelector(state => state.matrix);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const clientRef = useRef(null);

  // Fetch Matrix credentials when session is available
  useEffect(() => {
    if (session?.user?.id && !credentials && !loading) {
      logger.info('[MatrixClientContext] Fetching Matrix credentials for user:', session.user.id);
      dispatch(fetchMatrixCredentials(session.user.id));
    }
  }, [session, credentials, loading, dispatch]);

  // Initialize Matrix client when credentials are available (Element-web style)
  useEffect(() => {
    const initializeClient = async () => {
      if (!credentials) {
        logger.info('[MatrixClientContext] No Matrix credentials available yet');
        return;
      }

      try {
        setLoading(true);
        setError(null);
        dispatch(setSyncState('INITIALIZING'));

        const { userId, accessToken, homeserver, deviceId } = credentials;
        const homeserverUrl = homeserver || 'https://dfix-hsbridge.duckdns.org';

        logger.info('[MatrixClientContext] Creating Matrix client with credentials');

        // Create Matrix client directly (Element-web style)
        const matrixClient = matrixSdk.createClient({
          baseUrl: homeserverUrl,
          userId: userId,
          deviceId: deviceId || `DFIX_WEB_${Date.now()}`,
          accessToken: accessToken,
          timelineSupport: true,
          store: new matrixSdk.MemoryStore({ localStorage: window.localStorage }),
          cryptoStore: window.indexedDB ? new matrixSdk.IndexedDBCryptoStore(window.indexedDB, 'matrix-js-sdk') : null,
          verificationMethods: ['m.sas.v1'],
          unstableClientRelationAggregation: true,
          useAuthorizationHeader: true
        });

        // Store in ref for sync handler access
        clientRef.current = matrixClient;

        // Set up sync listener before starting client
        matrixClient.on('sync', (state, prevState) => {
          logger.info(`[MatrixClientContext] Sync state: ${state} (prev: ${prevState})`);
          dispatch(setSyncState(state));

          if (state === 'PREPARED' && prevState !== 'PREPARED') {
            logger.info('[MatrixClientContext] Matrix client sync prepared');
            // Store in manager for other components to access
            matrixClientManager.setClient(userId, matrixClient);
            dispatch(setClientInitialized(true));
          }
        });

        // CRITICAL FIX: Disable call event handler to prevent "Cannot read properties of undefined (reading 'start')" error
        try {
          // Disable the call event handler before starting the client
          if (matrixClient.callEventHandler) {
            logger.info('[MatrixClientContext] Disabling call event handler to prevent errors');
            matrixClient.callEventHandler = null;
          }
        } catch (callHandlerError) {
          logger.warn('[MatrixClientContext] Error handling call event handler:', callHandlerError);
        }

        // Start client
        logger.info('[MatrixClientContext] Starting Matrix client');
        await matrixClient.startClient({
          initialSyncLimit: 20,
          includeArchivedRooms: true,
          lazyLoadMembers: true,
          disableCallEventHandler: true // Add this option to disable call handling
        });

        // Set client in state
        setClient(matrixClient);
        logger.info('[MatrixClientContext] Matrix client started');
      } catch (error) {
        logger.error('[MatrixClientContext] Error initializing Matrix client:', error);
        setError(error.message || 'Failed to initialize Matrix client');
        dispatch(setSyncState('ERROR'));
      } finally {
        setLoading(false);
      }
    };

    initializeClient();

    // Cleanup on unmount
    return () => {
      if (clientRef.current) {
        logger.info('[MatrixClientContext] Stopping Matrix client');
        clientRef.current.removeAllListeners();
        clientRef.current.stopClient();
        clientRef.current = null;
      }
    };
  }, [credentials, dispatch]);

  // Context value
  const value = {
    client,
    loading,
    error,
    syncState,
    // Helper methods
    getTelegramRooms: () => {
      if (!client || !session?.matrixCredentials?.userId) return [];
      return matrixClientManager.getTelegramRooms(session.matrixCredentials.userId);
    },
    createTelegramRoom: async (name) => {
      if (!client || !session?.matrixCredentials?.userId) {
        throw new Error('Matrix client not initialized');
      }

      // Ensure client is synced before creating room
      if (client.getSyncState() !== 'PREPARED') {
        logger.warn('[MatrixClientContext] Creating room before sync is complete');
      }

      return client.createRoom({
        name: `Telegram - ${name}`,
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
    },
    inviteTelegramBot: async (roomId, botUserId) => {
      if (!client || !session?.matrixCredentials?.userId) {
        throw new Error('Matrix client not initialized');
      }

      // Direct invite using Matrix client
      return client.invite(roomId, botUserId);
    },
    sendMessage: async (roomId, content) => {
      if (!client || !session?.matrixCredentials?.userId) {
        throw new Error('Matrix client not initialized');
      }

      // Direct message send using Matrix client
      const msgContent = typeof content === 'string'
        ? { msgtype: 'm.text', body: content }
        : content;

      return client.sendMessage(roomId, msgContent);
    },
    addRoomListener: (roomId, callback) => {
      if (!client || !session?.matrixCredentials?.userId) return;

      // Direct room event listener using Matrix client
      const onRoomEvent = (event, room) => {
        if (room.roomId === roomId) {
          callback(event, room);
        }
      };

      // Store the listener for cleanup
      const listeners = client._roomListeners || new Map();
      listeners.set(roomId, onRoomEvent);
      client._roomListeners = listeners;

      // Add the listener
      client.on('Room.timeline', onRoomEvent);
    },
    removeRoomListener: (roomId) => {
      if (!client || !session?.matrixCredentials?.userId) return;

      // Get the stored listener
      const listeners = client._roomListeners || new Map();
      const listener = listeners.get(roomId);

      if (listener) {
        // Remove the listener
        client.removeListener('Room.timeline', listener);
        listeners.delete(roomId);
      }
    },
    // RoomListManager methods
    syncRooms: (force = false) => {
      if (!client || !session?.matrixCredentials?.userId) return;
      return roomListManager.syncRooms(session.matrixCredentials.userId, force);
    },
    loadMessages: (roomId, limit = 50) => {
      if (!client || !session?.matrixCredentials?.userId) return [];
      return roomListManager.loadMessages(session.matrixCredentials.userId, roomId, limit);
    }
  };

  return (
    <MatrixClientContext.Provider value={value}>
      {children}
    </MatrixClientContext.Provider>
  );
};

// Custom hook to use the Matrix client context
export const useMatrixClient = () => {
  const context = useContext(MatrixClientContext);

  // First, check if window.matrixClient is available
  if (window.matrixClient) {
    // Check if the client is in STOPPED state and start it if needed
    const syncState = window.matrixClient.getSyncState ? window.matrixClient.getSyncState() : null;

    if (syncState === 'STOPPED' || syncState === 'ERROR') {
      logger.info(`[MatrixClientContext] window.matrixClient is in ${syncState} state, starting it`);
      try {
        // First try to stop the client if it's in an error state
        if (syncState === 'ERROR') {
          try {
            window.matrixClient.stopClient();
            logger.info('[MatrixClientContext] Stopped window.matrixClient before restarting');
          } catch (stopError) {
            logger.warn('[MatrixClientContext] Error stopping window.matrixClient:', stopError);
          }
        }

        // Now start the client
        window.matrixClient.startClient({
          initialSyncLimit: 10,
          includeArchivedRooms: true,
          lazyLoadMembers: true
        });
        logger.info('[MatrixClientContext] Started window.matrixClient');
      } catch (startError) {
        logger.error('[MatrixClientContext] Error starting window.matrixClient:', startError);
      }
    }

    // If context is undefined or context.client is null, use window.matrixClient
    if (!context || !context.client) {
      logger.info('[MatrixClientContext] Using window.matrixClient as fallback');

      // Return a context-like object with the window.matrixClient
      return {
        client: window.matrixClient,
        loading: false,
        error: null,
        syncState: window.matrixClient.getSyncState ? window.matrixClient.getSyncState() : 'PREPARED',
        getTelegramRooms: () => {
          try {
            // Get all rooms
            const rooms = window.matrixClient.getRooms ? window.matrixClient.getRooms() : [];

            // Filter for Telegram rooms
            return rooms.filter(room => {
              try {
                // Check if room has Telegram bot as a member
                const members = room.getJoinedMembers ? room.getJoinedMembers() : [];
                const hasTelegramBot = members.some(member =>
                  member.userId === '@telegrambot:dfix-hsbridge.duckdns.org' || // Specific bot ID
                  member.userId.includes('telegram') ||
                  (member.name && member.name.includes('Telegram'))
                );

                // Check room name for Telegram indicators
                const roomName = room.name || '';
                const isTelegramRoom = roomName.includes('Telegram') ||
                                      roomName.includes('tg_') ||
                                      (room.getCanonicalAlias && room.getCanonicalAlias()?.includes('telegram'));

                // Check for Telegram-specific state events
                let hasTelegramState = false;
                try {
                  const telegramStateEvents = room.currentState.getStateEvents('io.dailyfix.telegram');
                  hasTelegramState = telegramStateEvents && telegramStateEvents.length > 0;
                } catch (error) {
                  // State event might not exist
                  hasTelegramState = false;
                }

                return hasTelegramBot || isTelegramRoom || hasTelegramState;
              } catch (error) {
                return false;
              }
            });
          } catch (error) {
            return [];
          }
        },
        createTelegramRoom: async (name) => {
          try {
            return window.matrixClient.createRoom({
              name: `Telegram - ${name}`,
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
          } catch (error) {
            return Promise.reject('Failed to create Telegram room');
          }
        },
        inviteTelegramBot: async (roomId, botUserId) => {
          try {
            return window.matrixClient.invite(roomId, botUserId);
          } catch (error) {
            return Promise.reject('Failed to invite Telegram bot');
          }
        },
        sendMessage: async (roomId, content) => {
          try {
            const messageContent = typeof content === 'string'
              ? { msgtype: 'm.text', body: content }
              : content;

            return window.matrixClient.sendMessage(roomId, messageContent);
          } catch (error) {
            return Promise.reject('Failed to send message');
          }
        },
        addRoomListener: (roomId, callback) => {
          try {
            const onRoomEvent = (event, room) => {
              if (room.roomId === roomId) {
                callback(event, room);
              }
            };

            window.matrixClient.on('Room.timeline', onRoomEvent);

            // Store the listener for cleanup
            const listeners = window.matrixClient._roomListeners || new Map();
            listeners.set(roomId, onRoomEvent);
            window.matrixClient._roomListeners = listeners;
          } catch (error) {
            // Ignore errors
          }
        },
        removeRoomListener: (roomId) => {
          try {
            const listeners = window.matrixClient._roomListeners || new Map();
            const listener = listeners.get(roomId);

            if (listener) {
              window.matrixClient.removeListener('Room.timeline', listener);
              listeners.delete(roomId);
            }
          } catch (error) {
            // Ignore errors
          }
        },
        syncRooms: (force = false) => {
          try {
            // Get all rooms
            const rooms = window.matrixClient.getRooms ? window.matrixClient.getRooms() : [];

            // If force is true, try to restart the client if it's in a bad state
            if (force) {
              const syncState = window.matrixClient.getSyncState ? window.matrixClient.getSyncState() : null;
              if (syncState === 'ERROR' || syncState === 'STOPPED') {
                logger.info(`[MatrixClientContext] Force sync requested, restarting client in ${syncState} state`);
                try {
                  // Stop the client if needed
                  if (syncState === 'ERROR') {
                    window.matrixClient.stopClient();
                  }

                  // Start the client
                  window.matrixClient.startClient({
                    initialSyncLimit: 10,
                    includeArchivedRooms: true,
                    lazyLoadMembers: true
                  });
                } catch (syncError) {
                  logger.error('[MatrixClientContext] Error restarting client during force sync:', syncError);
                }
              }
            }

            // Return rooms directly
            return rooms;
          } catch (error) {
            return [];
          }
        },
        loadMessages: (roomId, limit = 50) => {
          try {
            const room = window.matrixClient.getRoom ? window.matrixClient.getRoom(roomId) : null;
            if (!room) return [];

            const timeline = room.getLiveTimeline ? room.getLiveTimeline() : null;
            if (!timeline) return [];

            const events = timeline.getEvents ? timeline.getEvents() : [];

            // Convert events to messages
            return events
              .filter(event => event.getType ? event.getType() === 'm.room.message' : false)
              .slice(-limit)
              .map(event => ({
                id: event.getId ? event.getId() : `msg-${Date.now()}-${Math.random()}`,
                sender: event.getSender ? event.getSender() : 'unknown',
                content: event.getContent ? event.getContent() : { msgtype: 'm.text', body: 'Unknown message' },
                timestamp: event.getOriginServerTs ? event.getOriginServerTs() : Date.now(),
                isFromMe: event.getSender ? event.getSender() === window.matrixClient.getUserId() : false
              }));
          } catch (error) {
            return [];
          }
        }
      };
    }

    // If context exists and has a client, but we also have window.matrixClient,
    // enhance the context with window.matrixClient
    if (context && context.client) {
      return {
        ...context,
        // Ensure we have a backup client if needed
        _backupClient: window.matrixClient
      };
    }
  }

  // If window.matrixClient is not available, return context if it exists
  if (context) {
    return context;
  }

  // If neither context nor window.matrixClient is available, return a default context
  console.warn('useMatrixClient must be used within a MatrixClientProvider');
  return {
    client: null,
    loading: true,
    error: 'Matrix client context not available',
    syncState: 'ERROR',
    getTelegramRooms: () => [],
    createTelegramRoom: () => Promise.reject('Matrix client not available'),
    inviteTelegramBot: () => Promise.reject('Matrix client not available'),
    sendMessage: () => Promise.reject('Matrix client not available'),
    addRoomListener: () => {},
    removeRoomListener: () => {},
    syncRooms: () => [],
    loadMessages: () => []
  };
};

export default MatrixClientContext;
