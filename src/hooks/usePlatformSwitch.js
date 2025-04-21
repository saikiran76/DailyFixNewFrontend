import { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import logger from '../utils/logger';
import platformManager from '../services/PlatformManager';

/**
 * Hook for managing platform switching
 * @param {string} initialPlatform - Initial platform to use
 * @returns {Object} Platform switching utilities
 */
const usePlatformSwitch = (initialPlatform = null) => {
  const [currentPlatform, setCurrentPlatform] = useState(initialPlatform);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const dispatch = useDispatch();

  // Initialize platform on mount if initial platform is provided
  useEffect(() => {
    if (initialPlatform) {
      switchPlatform(initialPlatform);
    }
  }, []);

  // Switch to a different platform
  const switchPlatform = useCallback(async (platform, options = {}) => {
    if (!platform) {
      logger.error('[usePlatformSwitch] Cannot switch to undefined platform');
      return false;
    }

    // If we're already on this platform, just return success
    if (currentPlatform === platform) {
      logger.info(`[usePlatformSwitch] Already on platform ${platform}`);
      return true;
    }

    try {
      setIsLoading(true);
      setError(null);

      logger.info(`[usePlatformSwitch] Switching from ${currentPlatform || 'none'} to ${platform}`);
      
      // Use platform manager to handle the switch
      const success = await platformManager.switchPlatform(platform, options);
      
      if (success) {
        setCurrentPlatform(platform);
        
        // Store selected platform in localStorage for persistence
        try {
          localStorage.setItem('dailyfix_selected_platform', platform);
        } catch (storageError) {
          logger.error('[usePlatformSwitch] Error saving selected platform to localStorage:', storageError);
        }
        
        logger.info(`[usePlatformSwitch] Successfully switched to ${platform}`);
        return true;
      } else {
        setError(`Failed to switch to ${platform}`);
        logger.error(`[usePlatformSwitch] Failed to switch to ${platform}`);
        return false;
      }
    } catch (err) {
      const errorMessage = err.message || `Error switching to ${platform}`;
      setError(errorMessage);
      logger.error(`[usePlatformSwitch] ${errorMessage}`, err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentPlatform]);

  return {
    currentPlatform,
    isLoading,
    error,
    switchPlatform
  };
};

export default usePlatformSwitch;
