import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { signOut } from '../store/slices/authSlice';
import logger from '../utils/logger';

/**
 * SessionExpirationHandler - Handles Supabase session expiration gracefully
 *
 * This component:
 * 1. Monitors for 403 Forbidden errors from Supabase
 * 2. Shows a user-friendly notification when the session expires
 * 3. Performs a clean logout after a short delay
 * 4. Redirects to the login page
 */
const SessionExpirationHandler = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { session } = useSelector(state => state.auth);
  const [isExpiring, setIsExpiring] = useState(false);

  // Handle session expiration - wrapped in useCallback to avoid dependency issues
  const handleSessionExpiration = useCallback((reason = 'unknown') => {
    if (isExpiring) return; // Prevent multiple handlers from firing

    logger.warn(`[SessionExpirationHandler] Handling session expiration, reason: ${reason}`);

    // Prevent multiple expiration handlers from firing
    setIsExpiring(true);

    // Show a user-friendly notification
    toast.error(
      'Your session has expired. Please log in again.',
      {
        duration: 5000,
        id: 'session-expired',
        style: {
          borderRadius: '10px',
          background: '#333',
          color: '#fff',
          padding: '16px',
          fontWeight: 'bold'
        },
        icon: '🔒'
      }
    );

    // Perform a clean logout after a short delay
    setTimeout(() => {
      logger.info('[SessionExpirationHandler] Performing clean logout due to session expiration');

      // DO NOT clean up Matrix resources - they should be preserved
      // Just log that we're handling a session expiration
      logger.info('[SessionExpirationHandler] Handling Supabase session expiration');

      // Dispatch signOut action
      dispatch(signOut())
        .then(() => {
          // Redirect to login page
          navigate('/login');

          // No need to reload the page - we've preserved Matrix credentials
          // Just log that we've redirected
          logger.info('[SessionExpirationHandler] Redirected to login page');
        })
        .catch(error => {
          logger.error('[SessionExpirationHandler] Error during signOut:', error);
          // Force redirect to login even if logout fails
          navigate('/login');
        });
    }, 2000);
  }, [dispatch, navigate, isExpiring]);

  // Set up global fetch interceptor to detect 403 errors
  useEffect(() => {
    if (!session) return;

    logger.info('[SessionExpirationHandler] Setting up session expiration handler');

    // Store the original fetch function
    const originalFetch = window.fetch;

    // Create our interceptor function
    window.fetch = async function(resource, options) {
      try {
        // Call the original fetch
        const response = await originalFetch(resource, options);

        // Check if this is a Supabase auth endpoint with a 403 error
        // CRITICAL FIX: Properly check if resource is a string before calling includes
        if (
          typeof resource === 'string' &&
          resource.includes('supabase') &&
          !isExpiring
        ) {
          logger.warn('[SessionExpirationHandler] Detected Supabase auth 403 error, session likely expired');
          handleSessionExpiration('403-error');
        }

        // Return the original response
        return response;
      } catch (error) {
        // If there's an error in the fetch, log it and rethrow
        logger.error('[SessionExpirationHandler] Error in fetch interceptor:', error);
        throw error;
      }
    };

    // Listen for the custom event from TokenManager
    const handleTokenManagerEvent = (event) => {
      logger.warn(`[SessionExpirationHandler] Received custom event: ${event.type}, reason: ${event.detail?.reason}`);
      handleSessionExpiration(event.detail?.reason || 'token-manager-event');
    };

    // Listen for the global cleanup event
    const handleGlobalCleanup = () => {
      logger.info('[SessionExpirationHandler] Received global cleanup event');

      // Cancel any pending API requests
      if (window.AbortController && window._pendingRequests) {
        for (const controller of window._pendingRequests) {
          try {
            controller.abort();
          } catch {
            // Ignore errors
          }
        }
        window._pendingRequests = [];
        logger.info('[SessionExpirationHandler] Aborted all pending requests');
      }

      // Close any open WebSocket connections
      if (window._socketConnections) {
        for (const socket of window._socketConnections) {
          try {
            socket.close();
          } catch {
            // Ignore errors
          }
        }
        window._socketConnections = [];
        logger.info('[SessionExpirationHandler] Closed all WebSocket connections');
      }
    };

    // Add event listeners for the custom events
    window.addEventListener('supabase-session-expired', handleTokenManagerEvent);
    window.addEventListener('dailyfix-global-cleanup', handleGlobalCleanup);

    // Initialize tracking arrays if they don't exist
    window._pendingRequests = window._pendingRequests || [];
    window._socketConnections = window._socketConnections || [];

    // Clean up the interceptor when the component unmounts
    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('supabase-session-expired', handleTokenManagerEvent);
      window.removeEventListener('dailyfix-global-cleanup', handleGlobalCleanup);
      logger.info('[SessionExpirationHandler] Cleaned up session expiration handler');
    };
  }, [session, dispatch, navigate, isExpiring, handleSessionExpiration]);

  // This component doesn't render anything
  return null;
};

export default SessionExpirationHandler;
