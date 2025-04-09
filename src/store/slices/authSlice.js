import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabase';
import { tokenManager } from '../../utils/tokenManager';
import { fetchOnboardingStatus } from './onboardingSlice';
import logger from '../../utils/logger';
import authService from '../../services/authService';

// Initial state with proper typing
const initialState = {
  session: null,
  user: null,
  loading: false,
  error: null,
  initializing: false,
  hasInitialized: false,
  matrixCredentials: null,
  onboardingFetching: false
};

// Async thunks
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

      if (state.hasInitialized && state.session?.access_token) {
        // Validate existing session before skipping
        const { data: { user }, error: validateError } = await supabase.auth.getUser(state.session.access_token);
        if (!validateError && user) {
          logger.info('⏭️ [Auth] Skipping initialization - valid session exists');
          return { session: state.session, user };
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
  async (_, { rejectWithValue }) => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Clear stored tokens and local storage
      localStorage.clear();
      tokenManager.clearTokens();
      
      return null;
    } catch (error) {
      logger.info('[Auth] Sign out failed:', error);
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
      .addCase(signOut.fulfilled, (state) => {
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
  setOnboardingFetching
} = authSlice.actions;

export const selectSession = (state) => state.auth.session;
export const selectUser = (state) => state.auth.user;
export const selectIsLoading = (state) => state.auth.loading;
export const selectError = (state) => state.auth.error;
export const selectIsInitializing = (state) => state.auth.initializing;
export const selectHasInitialized = (state) => state.auth.hasInitialized;
export const selectMatrixCredentials = (state) => state.auth.matrixCredentials;

export const authReducer = authSlice.reducer;