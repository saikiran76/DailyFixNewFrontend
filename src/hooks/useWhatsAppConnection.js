import { useState, useCallback, useEffect } from 'react';
import { initializeSocket, checkSocketHealth } from '../utils/socket';
import { api } from '../services/api';
import { toast } from 'react-hot-toast';

const CONNECTION_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  STATUS_CHECK_INTERVAL: 10000
};

export const useWhatsAppConnection = () => {
  const [state, setState] = useState({
    status: 'initializing',
    error: null,
    retryCount: 0,
    isSocketConnected: false,
    lastStatusCheck: null
  });

  const checkStatus = useCallback(async (socket) => {
    if (!socket?.connected) {
      setState(prev => ({
        ...prev,
        status: 'disconnected',
        isSocketConnected: false
      }));
      return;
    }

    try {
      socket.emit('whatsapp:status_check');
    } catch (error) {
      console.error('Status check failed:', error);
      setState(prev => ({
        ...prev,
        error: error.message,
        lastStatusCheck: new Date()
      }));
    }
  }, []);

  const connect = useCallback(async (isRetry = false) => {
    try {
      setState(prev => ({ 
        ...prev, 
        status: 'initializing',
        error: null
      }));

      // Check socket health first
      const health = checkSocketHealth();
      let socket;

      if (!health.connected) {
        // Initialize socket connection with enhanced options
        socket = await initializeSocket({
          timeout: 30000,
          forceNew: false,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
          transports: ['websocket', 'polling'],
          upgrade: true,
          rememberUpgrade: true,
          pingTimeout: 60000,
          pingInterval: 25000,
          extraHeaders: {
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=300'
          }
        });
      } else {
        socket = health.socket;
      }

      if (!socket) {
        throw new Error('Failed to initialize socket connection');
      }

      setState(prev => ({
        ...prev,
        isSocketConnected: true
      }));

      // Set up WhatsApp status listener
      socket.on('whatsapp:status', (data) => {
        setState(prev => ({
          ...prev,
          status: data.status,
          error: null,
          lastStatusCheck: new Date()
        }));

        if (data.status === 'connected' || data.status === 'active') {
          toast.success('WhatsApp connection active');
        }
      });

      socket.on('whatsapp:error', (error) => {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: error.message,
          lastStatusCheck: new Date()
        }));
        toast.error(error.message);
      });

      // Request WhatsApp connection
      socket.emit('whatsapp:connect');

      return socket;

    } catch (error) {
      console.error('WhatsApp connection error:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error.message,
        isSocketConnected: false
      }));
      throw error;
    }
  }, []);

  // Set up periodic status checks
  useEffect(() => {
    if (state.status === 'connected' || state.status === 'active') {
      const interval = setInterval(() => {
        const socket = checkSocketHealth().socket;
        if (socket) {
          checkStatus(socket);
        }
      }, CONNECTION_CONFIG.STATUS_CHECK_INTERVAL);

      return () => clearInterval(interval);
    }
  }, [state.status, checkStatus]);

  return {
    ...state,
    connect,
    retry: async () => {
      if (state.retryCount >= CONNECTION_CONFIG.MAX_RETRIES) {
        toast.error('Maximum retry attempts reached. Please try again later.');
        return false;
      }
      setState(prev => ({ 
        ...prev, 
        retryCount: prev.retryCount + 1
      }));
      return connect(true);
    },
    checkStatus
  };
}; 