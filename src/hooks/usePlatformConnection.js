import { useState, useCallback, useEffect } from 'react';
import { useSocketConnection } from './useSocketConnection';
import { PLATFORM_CONFIGS } from '../constants/platforms';
import api from '../utils/api';
import { toast } from 'react-hot-toast';

export const usePlatformConnection = (platform) => {
  const { socket, isConnected, error: socketError } = useSocketConnection(platform);
  const [state, setState] = useState({
    status: 'initializing',
    error: null,
    qrCode: null,
    bridgeRoomId: null,
    botToken: '',
    retryCount: 0,
    connectionType: PLATFORM_CONFIGS[platform].connectionType,
    requiresToken: false,
    requiresLogin: false,
    connectionState: 'idle',
    isConnecting: false
  });

  const handleStatusUpdate = useCallback((data) => {
    switch (data.status) {
      case 'pending':
        setState(prev => ({
          ...prev,
          status: 'pending',
          bridgeRoomId: data.bridgeRoomId,
          error: null,
          isConnecting: false
        }));
        break;
      case 'awaiting_scan':
        setState(prev => ({
          ...prev,
          status: 'pending',
          bridgeRoomId: data.bridgeRoomId,
          error: null,
          isConnecting: false
        }));
        toast.success('QR code is ready in Element. Please scan it with your WhatsApp.');
        break;
      case 'connected':
        setState(prev => ({
          ...prev,
          status: 'connected',
          error: null,
          bridgeRoomId: data.bridgeRoomId,
          isConnecting: false
        }));
        toast.success(`${platform} connected successfully!`);
        break;
      case 'error':
        setState(prev => ({
          ...prev,
          status: 'error',
          error: data.error,
          bridgeRoomId: null,
          isConnecting: false
        }));
        toast.error(data.error || 'Connection error occurred');
        break;
    }
  }, [platform]);

  const connect = useCallback(async (token) => {
    if (state.isConnecting) {
      console.log('Connection already in progress');
      return;
    }

    setState(prev => ({
      ...prev,
      isConnecting: true,
      status: 'pending',
      error: null
    }));

    try {
      console.log(`Initiating ${platform} connection...`);
      const response = await api.post(`/connect/${platform}/initiate`);
      
      if (response.data.status === 'pending' || response.data.requiresToken) {
        setState(prev => ({
          ...prev,
          status: 'pending',
          error: null,
          isConnecting: false,
          requiresToken: response.data.requiresToken || false
        }));
      } else {
        throw new Error(response.data.message || 'Failed to connect');
      }
    } catch (error) {
      console.error(`Error connecting to ${platform}:`, error);
      
      // Handle timeout specifically
      if (error.isTimeout) {
        toast.error('Connection is taking longer than expected. Retrying...');
        setState(prev => ({
          ...prev,
          status: 'pending',
          error: null,
          isConnecting: false
        }));
        // Auto-retry after a delay
        setTimeout(() => connect(), 2000);
        return;
      }

      setState(prev => ({
        ...prev,
        status: 'error',
        error: error.response?.data?.message || error.message,
        isConnecting: false
      }));
      throw error;
    }
  }, [platform, state.isConnecting]);

  const finalize = useCallback(async (credentials) => {
    if (state.isConnecting) {
      console.log('Connection already in progress');
      return false;
    }

    try {
      setState(prev => ({ 
        ...prev, 
        status: 'connecting',
        isConnecting: true 
      }));
      
      console.log(`Finalizing ${platform} connection...`);
      
      // Show loading toast for longer operations
      const loadingToast = toast.loading(`Connecting to ${platform}...`);
      
      const response = await api.post(`/connect/${platform}/finalize`, credentials);
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);

      if (response.data.status === 'connected') {
        setState(prev => ({
          ...prev,
          status: 'connected',
          error: null,
          isConnecting: false
        }));
        return true;
      }
      throw new Error(response.data.message || 'Connection failed');
    } catch (error) {
      console.error(`Error finalizing ${platform} connection:`, error);
      
      // Handle timeout specifically
      if (error.isTimeout) {
        toast.error('Connection is taking longer than expected. Please try again.');
        setState(prev => ({
          ...prev,
          status: 'pending',
          error: 'Connection timeout. Please try again.',
          isConnecting: false
        }));
        return false;
      }

      setState(prev => ({
        ...prev,
        status: 'error',
        error: error.response?.data?.message || error.message,
        isConnecting: false
      }));
      return false;
    }
  }, [platform, state.isConnecting]);

  useEffect(() => {
    if (socket && isConnected) {
      socket.on(`${platform}_status`, handleStatusUpdate);
      return () => {
        socket.off(`${platform}_status`);
      };
    }
  }, [socket, isConnected, platform, handleStatusUpdate]);

  const cleanup = useCallback(() => {
    if (socket) {
      socket.off(`${platform}_status`);
      socket.off('connect_error');
      socket.off('disconnect');
    }
    setState(prev => ({
      ...prev,
      isConnecting: false,
      status: 'idle'
    }));
  }, [socket, platform]);

  return {
    ...state,
    connect,
    finalize,
    isSocketConnected: isConnected,
    cleanup,
    retry: async () => {
      if (state.retryCount >= 3) return false;
      setState(prev => ({ 
        ...prev, 
        retryCount: prev.retryCount + 1,
        isConnecting: false 
      }));
      return connect();
    }
  };
}; 