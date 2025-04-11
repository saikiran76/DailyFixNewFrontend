import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';
import { initializeAuth } from './store/slices/authSlice';
import AppRoutes from './routes/AppRoutes';
import logger from './utils/logger';

const AppContent = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const auth = useSelector(state => state.auth);
  const { initializing, hasInitialized, error, session } = auth;

  logger.info('[AppContent] Current state:', {
    path: location.pathname,
    initializing,
    hasInitialized,
    hasSession: !!session,
    hasError: !!error
  });

  // Single initialization effect
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (!mounted) return;

      try {
        // Check if we already have a valid session in localStorage
        const authDataStr = localStorage.getItem('dailyfix_auth');
        if (authDataStr) {
          try {
            const authData = JSON.parse(authDataStr);
            const expiryStr = authData.session?.expires_at || localStorage.getItem('session_expiry');
            const now = new Date();
            const expiryTime = expiryStr ? new Date(expiryStr) : null;
            const isSessionValid = expiryTime && expiryTime > now;

            logger.info('[AppContent] Checking stored session:', {
              hasExpiry: !!expiryTime,
              expiryTime: expiryTime?.toISOString(),
              now: now.toISOString(),
              isValid: isSessionValid
            });

            // If session is still valid, we can skip initialization
            if (isSessionValid && session) {
              logger.info('[AppContent] Using stored session - still valid');
              return;
            }
          } catch (parseError) {
            logger.error('[AppContent] Error parsing stored auth data:', parseError);
          }
        }

        logger.info('[AppContent] Starting auth initialization');
        await dispatch(initializeAuth()).unwrap();
        if (mounted) {
          logger.info('[AppContent] Auth initialization complete');
        }
      } catch (error) {
        if (mounted) {
          logger.info('[AppContent] Auth initialization failed:', error);
        }
      }
    };

    if (!hasInitialized && !initializing) {
      initialize();
    }

    return () => {
      mounted = false;
    };
  }, [dispatch, hasInitialized, initializing, session]);

  // Show loading state while initializing
  if (initializing) {
    logger.info('[AppContent] Showing loading - initializing');
    return <div>Loading...</div>;
  }

  // If we're not initializing and have no session, redirect to login
  // unless we're already on the login page
  if (!initializing && !session && !['login', 'signup'].includes(location.pathname.split('/')[1])) {
    logger.info('[AppContent] No session found, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // If we have an error during initialization, show it and redirect to login
  if (error) {
    logger.info('[AppContent] Error during initialization:', error);
    return <Navigate to="/login" replace />;
  }

  logger.info('[AppContent] Rendering routes');
  return <AppRoutes />;
};

export default AppContent;