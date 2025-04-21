import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabase';
import { tokenManager } from '../../utils/tokenManager';
import { fetchOnboardingStatus } from './onboardingSlice';
import logger from '../../utils/logger';
import authService from '../../services/authService';
import { initiateGoogleSignIn } from '../../utils/googleAuth';

// Initial state with proper typing
const initialState = {
  session: null,
  user: null,
  loading: false,
  error: null,
  initializing: false,
  hasInitialized: false,
  matrixCredentials: null,
  onboardingFetching: false,
  googleAuthPending: false
};

// Async thunks
export const signInWithGoogle = createAsyncThunk(
  'auth/signInWithGoogle',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setGoogleAuthPending(true));
      await initiateGoogleSignIn();
      // Note: The actual authentication will be handled by the redirect
      // We're not returning anything here as the page will be redirected
      return null;
    } catch (error) {
      logger.error('[Auth] Google sign-in error:', error);
      dispatch(setGoogleAuthPending(false));
      return rejectWithValue(error.message || 'Failed to sign in with Google');
    }
  }
);

export const signIn = createAsyncThunk(
  'auth/signIn',
  async ({ email, password }, { dispatch, getState, rejectWithValue }) => {
    try {
      const authData = await authService.signIn(email, password);

      // Validate complete session data
      if (!authData?.session?.access_token || !authData?.session?.refresh_token || !authData?.session?.user) {
        throw new Error('Invalid authentication response - incomplete session data');
      }

      // Update session first (this will trigger token storage)
      dispatch(updateSession({ session: authData.session }));

      // Verify token storage before proceeding
      const storedAuth = localStorage.getItem('dailyfix_auth');
      if (!storedAuth) {
        throw new Error('Token storage failed after sign in');
      }

      // Parse stored auth to verify complete structure
      const parsedAuth = JSON.parse(storedAuth);
      if (!parsedAuth?.access_token || !parsedAuth?.refresh_token) {
        throw new Error('Invalid token structure in storage');
      }

      // Check if we're already fetching onboarding status
      const state = getState();
      if (!state.auth.onboardingFetching) {
        try {
          dispatch(authSlice.actions.setOnboardingFetching(true));
          await dispatch(fetchOnboardingStatus()).unwrap();
        } catch (onboardingError) {
          logger.error('[Auth] Failed to fetch initial onboarding status:', onboardingError);
        } finally {
          dispatch(authSlice.actions.setOnboardingFetching(false));
        }
      }

      return authData;
    } catch (error) {
      logger.error('[Auth] Sign in failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async (_, { getState, dispatch, rejectWithValue }) => {
    try {
      const state = getState().auth;

      // Only skip if we have both initialized AND a valid session
      if (state.initializing) {
        logger.info('⏭️ [Auth] Skipping initialization - already in progress');
        return state.session ? { session: state.session, user: state.user } : null;
      }

      // CRITICAL FIX: First check localStorage for session data
      try {
        const authDataStr = localStorage.getItem('dailyfix_auth');
        if (authDataStr) {
          const authData = JSON.parse(authDataStr);
          if (authData?.session?.access_token) {
            logger.info('🔍 [Auth] Found session in localStorage');

            // Validate the token
            const { data: { user }, error: validateError } = await supabase.auth.getUser(authData.session.access_token);
            if (!validateError && user) {
              logger.info('✅ [Auth] Session from localStorage is valid');
              return { session: authData.session, user };
            }
          }
        }
      } catch (localStorageError) {
        logger.warn('⚠️ [Auth] Error checking localStorage session:', localStorageError);
      }

      // Check if we have a persisted session in Redux store
      if (state.hasInitialized && state.session?.access_token) {
        // Check if the session is still valid based on expiry time
        const expiryStr = state.session.expires_at || localStorage.getItem('session_expiry');
        const now = new Date();
        const expiryTime = expiryStr ? new Date(expiryStr) : null;
        const isSessionValid = expiryTime && expiryTime > now;

        logger.info('🔍 [Auth] Checking persisted session:', {
          hasExpiry: !!expiryTime,
          expiryTime: expiryTime?.toISOString(),
          now: now.toISOString(),
          isValid: isSessionValid
        });

        if (isSessionValid) {
          // Validate existing session before skipping
          try {
            const { data: { user }, error: validateError } = await supabase.auth.getUser(state.session.access_token);
            if (!validateError && user) {
              logger.info('⏭️ [Auth] Skipping initialization - valid session exists');
              return { session: state.session, user };
            }
          } catch (tokenError) {
            logger.warn('⚠️ [Auth] Token validation failed:', tokenError);
            // Continue to refresh attempt
          }
        }
      }

      logger.info('🚀 [Auth] Starting auth initialization');

      // Force session validation
      const validatedSession = await authService.validateSession(true);

      if (!validatedSession) {
        logger.warn('⚠️ [Auth] No valid session found during initialization');
        return null;
      }

      // Fetch matrix credentials if we have a valid session
      try {
        const { data: matrixData } = await supabase
          .from('matrix_credentials')
          .select('*')
          .single();

        if (matrixData) {
          logger.info('🔑 [Auth] Found matrix credentials');
          validatedSession.matrixCredentials = matrixData;
        }
      } catch (matrixError) {
        logger.warn('⚠️ [Auth] Failed to fetch matrix credentials:', matrixError);
      }

      // After session validation, fetch onboarding status
      logger.info('📡 [Auth] Fetching onboarding status...');
      try {
        const onboardingResult = await dispatch(fetchOnboardingStatus()).unwrap();
        logger.info('✅ [Auth] Onboarding status fetched:', onboardingResult);
      } catch (onboardingError) {
        logger.error('❌ [Auth] Failed to fetch onboarding status during initialization:', onboardingError);
      }

      logger.info('🎉 [Auth] Auth initialization successful:', {
        hasSession: !!validatedSession.session,
        hasUser: !!validatedSession.user,
        hasMatrixCreds: !!validatedSession.matrixCredentials
      });

      return validatedSession;
    } catch (error) {
      logger.error('❌ [Auth] Auth initialization failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const signOut = createAsyncThunk(
  'auth/signOut',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      logger.info('[Auth] Signing out user');

      // CRITICAL FIX: Stop all background processes
      // This will prevent continued API calls after logout
      if (typeof window !== 'undefined') {
        // Dispatch a global cleanup event that components can listen for
        const cleanupEvent = new CustomEvent('dailyfix-global-cleanup');
        window.dispatchEvent(cleanupEvent);
        logger.info('[Auth] Dispatched global cleanup event');

        // Clear all timeouts and intervals
        // This is a drastic measure but necessary to stop background processes
        const highestTimeoutId = setTimeout(() => {}, 0);
        for (let i = 0; i < highestTimeoutId; i++) {
          clearTimeout(i);
          clearInterval(i);
        }
        logger.info('[Auth] Cleared all timeouts and intervals');
      }

      // DO NOT clean up Matrix client or credentials
      // Just log that we're preserving Matrix resources
      logger.info('[Auth] Preserving Matrix resources during signOut');

      // Clear any session flags
      sessionStorage.removeItem('connecting_to_telegram');

      // First, clear specific session data from localStorage
      // BUT preserve Matrix credentials

      // Save Matrix credentials before clearing
      const matrixCredentials = localStorage.getItem('matrix_credentials');
      const connectionStatus = localStorage.getItem('dailyfix_connection_status');

      // Clear Supabase auth data
      localStorage.removeItem('dailyfix_auth');
      localStorage.removeItem('access_token');
      localStorage.removeItem('session_expiry');

      // DO NOT remove Matrix credentials or connection status
      // localStorage.removeItem('matrix_credentials');
      // localStorage.removeItem('dailyfix_connection_status');

      // Clear UI state
      localStorage.removeItem('dailyfix_selected_platform');
      localStorage.removeItem('dailyfix_whatsapp_connected');
      localStorage.removeItem('dailyfix_telegram_connected');

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        logger.warn('[Auth] Error during Supabase signOut:', error);
        // Continue with cleanup even if Supabase signOut fails
      }

      // Instead of clearing all storage, we'll selectively clear items
      // This is to preserve Matrix credentials

      // DO NOT use localStorage.clear() as it would remove Matrix credentials
      // localStorage.clear();

      // Clear tokens but preserve Matrix credentials
      tokenManager.clearTokens();

      // Restore Matrix credentials if they existed
      if (matrixCredentials) {
        localStorage.setItem('matrix_credentials', matrixCredentials);
        logger.info('[Auth] Restored Matrix credentials after signOut');
      }

      // Restore connection status if it existed
      if (connectionStatus) {
        localStorage.setItem('dailyfix_connection_status', connectionStatus);
        logger.info('[Auth] Restored connection status after signOut');
      }

      // DO NOT clear Matrix IndexedDB storage
      // This would delete Matrix credentials
      //
      // try {
      //   indexedDB.deleteDatabase('matrix-js-sdk');
      //   logger.info('[Auth] Cleared IndexedDB storage');
      // } catch (e) {
      //   logger.warn('[Auth] Error clearing IndexedDB:', e);
      // }

      logger.info('[Auth] Preserved Matrix IndexedDB storage during signOut');

      // Clear any pending toasts
      if (typeof window !== 'undefined' && window.toast && window.toast.dismiss) {
        window.toast.dismiss();
      }

      // CRITICAL FIX: Reset all Redux state (except auth which we need for the redirect)
      // This will prevent continued API calls from Redux actions
      try {
        // Reset all other slices
        dispatch({ type: 'contacts/reset' });
        dispatch({ type: 'messages/reset' });
        dispatch({ type: 'onboarding/reset' });
        dispatch({ type: 'matrix/reset' });
        dispatch({ type: 'ui/reset' });
        logger.info('[Auth] Reset Redux state');
      } catch (e) {
        logger.error('[Auth] Error resetting Redux state:', e);
      }

      logger.info('[Auth] User signed out successfully');

      return null;
    } catch (error) {
      logger.error('[Auth] Sign out failed:', error);
      // Even if there's an error, we want to clear Supabase auth data
      // but preserve Matrix credentials
      try {
        // Save Matrix credentials before clearing
        const matrixCredentials = localStorage.getItem('matrix_credentials');
        const connectionStatus = localStorage.getItem('dailyfix_connection_status');

        // Clear Supabase auth data
        localStorage.removeItem('dailyfix_auth');
        localStorage.removeItem('access_token');
        localStorage.removeItem('session_expiry');

        // Restore Matrix credentials if they existed
        if (matrixCredentials) {
          localStorage.setItem('matrix_credentials', matrixCredentials);
        }

        // Restore connection status if it existed
        if (connectionStatus) {
          localStorage.setItem('dailyfix_connection_status', connectionStatus);
        }
      } catch (e) {
        // Ignore errors during emergency cleanup
        logger.error('[Auth] Error during emergency cleanup:', e);
      }
      return rejectWithValue(error.message);
    }
  }
);

// Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    updateSession: (state, action) => {
      const { session } = action.payload;
      state.session = session;
      state.user = session?.user || null;
      state.loading = false;
      state.error = null;
      state.hasInitialized = true;
      state.initializing = false;

      // Log session update
      logger.info('[AuthSlice] Session updated:', {
        hasSession: !!session,
        userId: session?.user?.id
      });
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
      state.loading = false;
    },
    setInitializing: (state, action) => {
      state.initializing = action.payload;
    },
    setHasInitialized: (state, action) => {
      state.hasInitialized = action.payload;
    },
    updateMatrixCredentials: (state, action) => {
      state.matrixCredentials = action.payload;
    },
    clearAuth: (state) => {
      state.session = null;
      state.user = null;
      state.loading = false;
      state.error = null;
      state.matrixCredentials = null;
      tokenManager.clearTokens();
    },
    setOnboardingFetching: (state, action) => {
      state.onboardingFetching = action.payload;
    },
    setGoogleAuthPending: (state, action) => {
      state.googleAuthPending = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      // Sign In
      .addCase(signIn.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        if (action.payload?.session && action.payload?.user) {
          state.session = action.payload.session;
          state.user = action.payload.user;
          state.loading = false;
          state.error = null;
          state.hasInitialized = true;
        }
      })
      .addCase(signIn.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.session = null;
        state.user = null;
      })

      // Initialize Auth
      .addCase(initializeAuth.pending, (state) => {
        if (!state.initializing) { // Only set if not already initializing
          state.initializing = true;
          state.error = null;
        }
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.initializing = false;
        state.loading = false;
        state.hasInitialized = true;
        if (action.payload) {
          state.session = action.payload.session;
          state.user = action.payload.user;
          state.matrixCredentials = action.payload.matrixCredentials;
        } else {
          state.session = null;
          state.user = null;
          state.matrixCredentials = null;
        }
        state.error = null;
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.initializing = false;
        state.loading = false;
        state.hasInitialized = true;
        state.error = action.payload;
        state.session = null;
        state.user = null;
        state.matrixCredentials = null;
      })

      // Sign Out
      .addCase(signOut.fulfilled, () => {
        return { ...initialState, loading: false, hasInitialized: true };
      })

      // Add case for fetchOnboardingStatus
      .addCase(fetchOnboardingStatus.pending, (state) => {
        state.onboardingFetching = true;
      })
      .addCase(fetchOnboardingStatus.fulfilled, (state, action) => {
        state.onboardingFetching = false;
        if (action.payload?.matrixCredentials) {
          state.matrixCredentials = action.payload.matrixCredentials;
        }
      })
      .addCase(fetchOnboardingStatus.rejected, (state) => {
        state.onboardingFetching = false;
      });
  }
});

export const {
  updateSession,
  setLoading,
  setError,
  setInitializing,
  setHasInitialized,
  updateMatrixCredentials,
  clearAuth,
  setOnboardingFetching,
  setGoogleAuthPending
} = authSlice.actions;

export const selectSession = (state) => state.auth.session;
export const selectUser = (state) => state.auth.user;
export const selectIsLoading = (state) => state.auth.loading;
export const selectError = (state) => state.auth.error;
export const selectIsInitializing = (state) => state.auth.initializing;
export const selectHasInitialized = (state) => state.auth.hasInitialized;
export const selectMatrixCredentials = (state) => state.auth.matrixCredentials;
export const selectGoogleAuthPending = (state) => state.auth.googleAuthPending;

export const authReducer = authSlice.reducer;