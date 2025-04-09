import { useEffect, useRef, useState, useCallback } from 'react';
import { initializeSocket, disconnectSocket, getSocket } from '../utils/socket';
import { supabase } from '../utils/supabase';
import { toast } from 'react-toastify';
import logger from '../utils/logger';

const CONNECTION_CONFIG = {
  MAX_RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY: 2000,
  CONNECTION_TIMEOUT: 30000
};

export const useSocketConnection = (platform) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const socketRef = useRef(null);
  const cleanupInProgressRef = useRef(false);
  const tokenValidRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const messageQueueRef = useRef([]);
  const eventCleanupRef = useRef([]);

  // Validate token
  const validateToken = useCallback(async () => {
    try {
      const authDataStr = localStorage.getItem('dailyfix_auth');
      if (!authDataStr) return false;

      const authData = JSON.parse(authDataStr);
      const { data: { user }, error } = await supabase.auth.getUser(authData.access_token);
      
      return !error && !!user;
    } catch (error) {
      logger.error('Token validation error:', error);
      return false;
    }
  }, []);

  // Clean up socket and event listeners
  const cleanupSocket = useCallback(async () => {
    if (cleanupInProgressRef.current) return;
    
    try {
      cleanupInProgressRef.current = true;
      
      // Clean up event listeners
      eventCleanupRef.current.forEach(cleanup => cleanup());
      eventCleanupRef.current = [];
      
      // Disconnect socket
      await disconnectSocket();
      
      // Reset state
      socketRef.current = null;
      setIsConnected(false);
      setConnectionStatus('disconnected');
      reconnectAttemptsRef.current = 0;
      
    } catch (error) {
      logger.error('Socket cleanup error:', error);
    } finally {
      cleanupInProgressRef.current = false;
    }
  }, []);

  // Handle reconnection
  const handleReconnection = useCallback(async () => {
    if (reconnectAttemptsRef.current >= CONNECTION_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.warn('Max reconnection attempts reached');
      setConnectionStatus('error');
      toast.error('Connection lost. Please refresh the page.');
      await cleanupSocket();
      return;
    }

    try {
      const authDataStr = localStorage.getItem('dailyfix_auth');
      if (!authDataStr) {
        console.error('No auth data found');
        setConnectionStatus('error');
        await cleanupSocket();
        return;
      }

      const authData = JSON.parse(authDataStr);
      const token = authData.access_token;

      reconnectAttemptsRef.current++;
      setConnectionStatus('reconnecting');
      
      // Exponential backoff
      const delay = Math.min(
        CONNECTION_CONFIG.RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
        10000
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      await initializeSocket({
        platform,
        onConnect: () => {
          setIsConnected(true);
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;
        },
        onDisconnect: () => {
          setIsConnected(false);
          setConnectionStatus('disconnected');
        },
        onError: (error) => {
          console.error('Socket error:', error);
          setConnectionStatus('error');
        },
        onAuthError: async () => {
          const isStillValid = await validateToken();
          if (!isStillValid) {
            await cleanupSocket();
          }
        }
      });
    } catch (error) {
      console.error('Reconnection attempt failed:', error);
      handleReconnection();
    }
  }, [cleanupSocket, validateToken, platform]);

  // Initialize socket connection
  const initializeSocketConnection = useCallback(async () => {
    if (socketRef.current || cleanupInProgressRef.current) {
      logger.debug('Socket already exists or cleanup in progress');
      return socketRef.current;
    }

    try {
      // Validate token before attempting connection
      const isValid = await validateToken();
      if (!isValid) {
        tokenValidRef.current = false;
        logger.debug('Token validation failed');
        await cleanupSocket();
        return null;
      }

      // Get fresh token after validation
      const authDataStr = localStorage.getItem('dailyfix_auth');
      if (!authDataStr) {
        logger.error('No auth data found');
        setConnectionStatus('error');
        await cleanupSocket();
        return null;
      }

      const authData = JSON.parse(authDataStr);
      const token = authData.access_token;

      tokenValidRef.current = true;
      setConnectionStatus('connecting');
      
      const socket = await initializeSocket({
        platform,
        onConnect: () => {
          setIsConnected(true);
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;
        },
        onDisconnect: () => {
          setIsConnected(false);
          setConnectionStatus('disconnected');
        },
        onError: (error) => {
          logger.error('Socket error:', error);
          setConnectionStatus('error');
        },
        onAuthError: async () => {
          const isStillValid = await validateToken();
          if (!isStillValid) {
            await cleanupSocket();
          }
        }
      });

      if (!socket) {
        throw new Error('Failed to create socket connection');
      }

      socketRef.current = socket;
      return socket;
    } catch (error) {
      logger.error('Socket initialization error:', error);
      setConnectionStatus('error');
      await cleanupSocket();
      return null;
    }
  }, [validateToken, cleanupSocket, platform]);

  // Safe emit wrapper
  const emit = useCallback(async (event, data) => {
    const socket = getSocket();
    if (!socket?.connected) {
      logger.debug('Socket not connected, queueing message:', event);
      messageQueueRef.current.push({ event, data });
      return false;
    }

    try {
      return await socket.emit(event, data);
    } catch (error) {
      logger.error('Emit error:', error);
      return false;
    }
  }, []);

  // Safe event listener wrapper
  const addEventListener = useCallback((event, handler) => {
    const socket = getSocket();
    if (!socket) return () => {};

    socket.on(event, handler);
    const cleanup = () => socket.off(event, handler);
    eventCleanupRef.current.push(cleanup);
    return cleanup;
  }, []);

  // Initialize socket on mount
  useEffect(() => {
    const init = async () => {
      const isValid = await validateToken();
      if (isValid) {
        await initializeSocketConnection();
      }
    };
    
    init();
    return cleanupSocket;
  }, [platform, initializeSocketConnection, cleanupSocket, validateToken]);

  useEffect(() => {
    if (!socketRef.current) {
      logger.info('[useSocketConnection] No socket instance');
      return;
    }

    logger.info('[useSocketConnection] Setting up socket connection:', {
      namespace: platform,
      socketId: socketRef.current.id,
      connected: socketRef.current.connected
    });

    const handleConnect = () => {
      logger.info('[useSocketConnection] Socket connected:', {
        socketId: socketRef.current.id,
        namespace: platform
      });
    };

    const handleDisconnect = (reason) => {
      logger.info('[useSocketConnection] Socket disconnected:', {
        reason,
        socketId: socketRef.current.id,
        namespace: platform
      });
    };

    const handleError = (error) => {
      logger.error('[useSocketConnection] Socket error:', {
        error,
        socketId: socketRef.current.id,
        namespace: platform
      });
    };

    socketRef.current.on('connect', handleConnect);
    socketRef.current.on('disconnect', handleDisconnect);
    socketRef.current.on('error', handleError);

    return () => {
      socketRef.current.off('connect', handleConnect);
      socketRef.current.off('disconnect', handleDisconnect);
      socketRef.current.off('error', handleError);
    };
  }, [platform]);

  return {
    socket: socketRef.current,
    isConnected,
    connectionStatus,
    emit,
    on: addEventListener,
    messageQueue: messageQueueRef.current
  };
};

export default useSocketConnection; 