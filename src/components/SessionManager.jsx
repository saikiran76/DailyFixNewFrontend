import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { initializeAuth } from '../store/slices/authSlice';
import { supabase } from '../utils/supabase';
import authService from '../services/authService';
import logger from '../utils/logger';
import { useStore } from 'react-redux';

/**
 * SessionManager component
 * Handles session persistence and redirects
 */
const SessionManager = ({ children }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const store = useStore();
  const getState = store.getState;
  const { session, initializing, hasInitialized } = useSelector(state => state.auth);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState(null);

  // Initialize auth on component mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsValidating(true);
        logger.info('[SessionManager] Initializing auth');

        // Clear any validation errors
        setValidationError(null);

        // Explicitly normalize and synchronize localStorage auth data
        const normalizeAuthData = () => {
          try {
            // Get all potential token sources
            const dailyfixAuth = localStorage.getItem('dailyfix_auth');
            const accessToken = localStorage.getItem('access_token');
            const refreshToken = localStorage.getItem('refresh_token');
            const sessionExpiry = localStorage.getItem('session_expiry');
            const persistAuth = localStorage.getItem('persist:auth');
            
            let normalizedAuthData = null;
            let userId = null;
            
            logger.info('[SessionManager] Normalizing auth data sources:', {
              hasDailyfixAuth: !!dailyfixAuth,
              hasAccessToken: !!accessToken,
              hasRefreshToken: !!refreshToken,
              hasSessionExpiry: !!sessionExpiry,
              hasPersistAuth: !!persistAuth
            });
            
            // Try to build complete auth data from available sources
            if (dailyfixAuth) {
              try {
                normalizedAuthData = JSON.parse(dailyfixAuth);
                userId = normalizedAuthData.user?.id || normalizedAuthData.session?.user?.id;
              } catch (e) {
                logger.error('[SessionManager] Error parsing dailyfix_auth:', e);
              }
            }
            
            // If no dailyfix_auth but we have persist:auth, build from there
            if (!normalizedAuthData && persistAuth) {
              try {
                const parsedPersistAuth = JSON.parse(persistAuth);
                const sessionStr = parsedPersistAuth.session;
                const userStr = parsedPersistAuth.user;
                
                if (sessionStr && sessionStr !== 'null' && userStr && userStr !== 'null') {
                  const session = JSON.parse(sessionStr);
                  const user = JSON.parse(userStr);
                  
                  normalizedAuthData = {
                    session: session,
                    user: user
                  };
                  userId = user?.id;
                  
                  logger.info('[SessionManager] Built normalized auth data from persist:auth');
                }
              } catch (e) {
                logger.error('[SessionManager] Error parsing persist:auth:', e);
              }
            }
            
            // If we have access_token but no complete auth data, create minimal structure
            if (accessToken && (!normalizedAuthData || !normalizedAuthData.session?.access_token)) {
              if (!normalizedAuthData) {
                normalizedAuthData = { session: {}, user: null };
              }
              
              if (!normalizedAuthData.session) {
                normalizedAuthData.session = {};
              }
              
              normalizedAuthData.session.access_token = accessToken;
              
              if (refreshToken) {
                normalizedAuthData.session.refresh_token = refreshToken;
              }
              
              if (sessionExpiry) {
                normalizedAuthData.session.expires_at = sessionExpiry;
              } else {
                // Default expiry 1 hour from now
                normalizedAuthData.session.expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
              }
              
              logger.info('[SessionManager] Created minimal auth data from access_token');
            }
            
            // Store the normalized data
            if (normalizedAuthData?.session?.access_token) {
              localStorage.setItem('dailyfix_auth', JSON.stringify(normalizedAuthData));
              localStorage.setItem('access_token', normalizedAuthData.session.access_token);
              
              if (normalizedAuthData.session.refresh_token) {
                localStorage.setItem('refresh_token', normalizedAuthData.session.refresh_token);
              }
              
              if (normalizedAuthData.session.expires_at) {
                localStorage.setItem('session_expiry', normalizedAuthData.session.expires_at);
              }
              
              logger.info('[SessionManager] Normalized auth data stored successfully');
              return normalizedAuthData;
            }
            
            return null;
          } catch (e) {
            logger.error('[SessionManager] Error normalizing auth data:', e);
            return null;
          }
        };

        // First normalize existing auth data
        const normalizedAuthData = normalizeAuthData();

        // If we have normalized auth data with a valid token, validate it
        if (normalizedAuthData?.session?.access_token) {
          logger.info('[SessionManager] Found normalized session data, validating...');

          // Validate the token
          const { data: { user }, error: validateError } = await supabase.auth.getUser(normalizedAuthData.session.access_token);
          if (!validateError && user) {
            logger.info('[SessionManager] Normalized session is valid');

            // Update Redux store with session data
            await authService.storeSessionData(normalizedAuthData.session);
            
            // Also update the access_token in localStorage for direct API access
            localStorage.setItem('access_token', normalizedAuthData.session.access_token);
            
            logger.info('[SessionManager] Session data stored in Redux store');
            setIsValidating(false);
            return;
          } else if (validateError) {
            logger.warn('[SessionManager] Session validation failed:', validateError);
            
            // Try to refresh the token if validation failed
            try {
              logger.info('[SessionManager] Attempting to refresh token');
              const { data, error: refreshError } = await supabase.auth.refreshSession();
              
              if (!refreshError && data?.session) {
                logger.info('[SessionManager] Token refresh successful');
                await authService.storeSessionData(data.session);
                setIsValidating(false);
                return;
              } else {
                logger.error('[SessionManager] Token refresh failed:', refreshError);
                // Continue to normal auth initialization
              }
            } catch (refreshError) {
              logger.error('[SessionManager] Error during token refresh:', refreshError);
              // Continue to normal auth initialization
            }
          }
        }

        // If no valid session in localStorage, initialize auth
        await dispatch(initializeAuth()).unwrap();
        logger.info('[SessionManager] Auth initialized successfully');
      } catch (error) {
        logger.error('[SessionManager] Auth initialization failed:', error);
        setValidationError(error.message || 'Session initialization failed');
      } finally {
        setIsValidating(false);
      }
    };

    if (!hasInitialized && !initializing && !isValidating) {
      initAuth();
    }
  }, [dispatch, hasInitialized, initializing, isValidating]);

  // Handle redirects based on session state
  useEffect(() => {
    // Skip redirects during initialization
    if (initializing) return;

    const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password'];
    const authRoutes = ['/auth/callback', '/auth/google/callback'];
    const isPublicRoute = publicRoutes.some(route => location.pathname.startsWith(route));
    const isAuthRoute = authRoutes.some(route => location.pathname.startsWith(route));

    // CRITICAL FIX: Skip redirects for auth routes
    if (isAuthRoute) {
      logger.info('[SessionManager] On auth route, skipping redirect');
      return;
    }

    if (!session && !isPublicRoute && !isAuthRoute) {
      // If no session and not on a public or auth route, redirect to login
      logger.info('[SessionManager] No session, redirecting to login');
      navigate('/login', { replace: true });
    } else if (session && isPublicRoute) {
      // CRITICAL FIX: Check onboarding status before redirecting
      const { onboarding } = getState();
      const isOnboardingComplete = onboarding?.isComplete;

      if (isOnboardingComplete) {
        // If onboarding is complete, redirect to dashboard
        logger.info('[SessionManager] Session exists and onboarding complete, redirecting to dashboard');
        navigate('/dashboard', { replace: true });
      } else {
        // If onboarding is not complete, redirect to onboarding
        logger.info('[SessionManager] Session exists but onboarding incomplete, redirecting to onboarding');
        navigate('/onboarding/welcome', { replace: true });
      }
    }
  }, [session, location.pathname, navigate, initializing]);

  // Show loading state during initialization or auth callback
  const isAuthRoute = location.pathname.includes('/auth/callback');
  if (initializing || isAuthRoute) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-4">
            {isAuthRoute ? 'Completing Authentication...' : 'Loading...'}
          </h2>
          <p className="text-gray-400">
            {isAuthRoute ? 'Please wait while we complete your sign-in.' : 'Please wait while we load your session.'}
          </p>
        </div>
      </div>
    );
  }

  return children;
};

export default SessionManager;
