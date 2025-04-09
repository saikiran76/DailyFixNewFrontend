import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import logger from '../utils/logger';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/';

export const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    // Initialize socket
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // Connection event handlers
    socketInstance.on('connect', () => {
      logger.info('Socket connected');
      setIsConnected(true);
      setLastError(null);
    });

    socketInstance.on('disconnect', (reason) => {
      logger.warn('Socket disconnected:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      logger.error('Socket connection error:', error);
      setLastError(error.message);
      setIsConnected(false);
    });

    socketInstance.on('error', (error) => {
      logger.error('Socket error:', error);
      setLastError(error.message);
    });

    // Set socket instance
    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      if (socketInstance) {
        socketInstance.removeAllListeners();
        socketInstance.close();
      }
    };
  }, []);

  return {
    socket,
    isConnected,
    lastError,
  };
}; 