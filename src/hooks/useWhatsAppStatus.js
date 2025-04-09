import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import api from '../utils/api';
import logger from '../utils/logger';

export const useWhatsAppStatus = (userId) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { session } = useSelector(state => state.auth);
  const statusRef = useRef(null);
  const checkInProgressRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let statusCheckInterval;

    const checkStatus = async () => {
      // Prevent multiple simultaneous checks
      if (checkInProgressRef.current) return;
      
      // Don't check status if no userId or session
      if (!userId || !session) {
        if (mounted) {
          setLoading(false);
          setStatus(null);
        }
        return;
      }

      try {
        checkInProgressRef.current = true;
        setLoading(true);
        setError(null);

        const response = await api.get(`/whatsapp/${userId}/status`);
        
        if (!mounted) return;

        // Only update if status has changed
        if (JSON.stringify(response.data) !== JSON.stringify(statusRef.current)) {
          statusRef.current = response.data;
          setStatus(response.data);
        }
      } catch (error) {
        logger.info('[useWhatsAppStatus] Error fetching status:', error);
        if (mounted) {
          setError(error.message);
          setStatus(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
        checkInProgressRef.current = false;
      }
    };

    // Only start loading and checking if we have a userId and session
    if (userId && session) {
      checkStatus();
      statusCheckInterval = setInterval(checkStatus, 30000); // Check every 30 seconds
    } else {
      setLoading(false);
      setStatus(null);
    }

    return () => {
      mounted = false;
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
    };
  }, [userId, session]);

  const refetch = useCallback(() => {
    setLoading(true);
    statusRef.current = null; // Force status update on next check
    checkInProgressRef.current = false; // Reset check in progress
  }, []);

  return { 
    status, 
    loading, 
    error,
    refetch
  };
};

export default useWhatsAppStatus; 