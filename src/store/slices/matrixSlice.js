import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../supabaseClient';
import logger from '../../utils/logger';
import { saveToIndexedDB, getFromIndexedDB } from '../../utils/indexedDBHelper';

// Constants
const MATRIX_CREDENTIALS_KEY = 'matrix_credentials';
const TOKEN_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes before expiry

// Async thunks
export const fetchMatrixCredentials = createAsyncThunk(
  'matrix/fetchCredentials',
  async (userId, { rejectWithValue }) => {
    try {
      logger.info('[matrixSlice] Fetching Matrix credentials for user:', userId);
      
      // First try to get credentials from IndexedDB
      const cachedCredentials = await getFromIndexedDB(userId, MATRIX_CREDENTIALS_KEY);
      if (cachedCredentials) {
        logger.info('[matrixSlice] Found cached Matrix credentials');
        
        // Check if token needs refresh
        const now = Date.now();
        const expiresAt = cachedCredentials.expires_at;
        
        if (expiresAt && expiresAt - now < TOKEN_REFRESH_THRESHOLD) {
          logger.info('[matrixSlice] Cached credentials need refresh');
          // Will continue to fetch from Supabase
        } else {
          return cachedCredentials;
        }
      }
      
      // If no valid cached credentials, fetch from Supabase
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'matrix')
        .eq('status', 'active')
        .single();
      
      if (error) {
        logger.error('[matrixSlice] Error fetching Matrix credentials:', error);
        return rejectWithValue(error.message);
      }
      
      if (!data || !data.credentials) {
        logger.warn('[matrixSlice] No Matrix credentials found for user:', userId);
        return rejectWithValue('No Matrix credentials found');
      }
      
      logger.info('[matrixSlice] Matrix credentials fetched successfully');
      
      // Save credentials to IndexedDB
      await saveToIndexedDB(userId, { 
        [MATRIX_CREDENTIALS_KEY]: data.credentials 
      });
      
      return data.credentials;
    } catch (error) {
      logger.error('[matrixSlice] Error in fetchMatrixCredentials:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const registerMatrixAccount = createAsyncThunk(
  'matrix/registerAccount',
  async (userId, { rejectWithValue }) => {
    try {
      logger.info('[matrixSlice] Registering new Matrix account for user:', userId);
      
      // Generate a secure password
      const generatePassword = () => {
        const array = new Uint8Array(24);
        window.crypto.getRandomValues(array);
        return btoa(String.fromCharCode.apply(null, array));
      };
      
      // Create Matrix username based on user ID
      const username = `user${userId.replace(/-/g, '')}matrixttestkoraca`;
      const password = generatePassword();
      
      // Call the auth service to register a new Matrix account
      const response = await fetch('/api/v1/auth/register-matrix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          userId
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        logger.error('[matrixSlice] Error registering Matrix account:', errorData);
        return rejectWithValue(errorData.message || 'Failed to register Matrix account');
      }
      
      const data = await response.json();
      logger.info('[matrixSlice] Matrix account registered successfully');
      
      // Save credentials to IndexedDB
      await saveToIndexedDB(userId, { 
        [MATRIX_CREDENTIALS_KEY]: data.credentials 
      });
      
      return data.credentials;
    } catch (error) {
      logger.error('[matrixSlice] Error in registerMatrixAccount:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const refreshMatrixToken = createAsyncThunk(
  'matrix/refreshToken',
  async (credentials, { rejectWithValue }) => {
    try {
      logger.info('[matrixSlice] Refreshing Matrix token');
      
      // Call the auth service to refresh the token
      const response = await fetch('/api/v1/auth/refresh-matrix-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: credentials.userId,
          accessToken: credentials.accessToken,
          deviceId: credentials.deviceId
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        logger.error('[matrixSlice] Error refreshing Matrix token:', errorData);
        return rejectWithValue(errorData.message || 'Failed to refresh Matrix token');
      }
      
      const data = await response.json();
      logger.info('[matrixSlice] Matrix token refreshed successfully');
      
      // Update credentials in IndexedDB
      const userId = credentials.userId.split(':')[0].substring(1);
      await saveToIndexedDB(userId, { 
        [MATRIX_CREDENTIALS_KEY]: {
          ...credentials,
          accessToken: data.accessToken,
          expires_at: data.expires_at
        } 
      });
      
      return {
        ...credentials,
        accessToken: data.accessToken,
        expires_at: data.expires_at
      };
    } catch (error) {
      logger.error('[matrixSlice] Error in refreshMatrixToken:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Initial state
const initialState = {
  credentials: null,
  clientInitialized: false,
  syncState: 'INITIAL', // INITIAL, SYNCING, PREPARED, ERROR
  loading: false,
  error: null
};

// Slice
const matrixSlice = createSlice({
  name: 'matrix',
  initialState,
  reducers: {
    setClientInitialized: (state, action) => {
      state.clientInitialized = action.payload;
    },
    setSyncState: (state, action) => {
      state.syncState = action.payload;
    },
    clearMatrixState: (state) => {
      state.credentials = null;
      state.clientInitialized = false;
      state.syncState = 'INITIAL';
      state.loading = false;
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    // fetchMatrixCredentials
    builder.addCase(fetchMatrixCredentials.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchMatrixCredentials.fulfilled, (state, action) => {
      state.credentials = action.payload;
      state.loading = false;
    });
    builder.addCase(fetchMatrixCredentials.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });
    
    // registerMatrixAccount
    builder.addCase(registerMatrixAccount.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(registerMatrixAccount.fulfilled, (state, action) => {
      state.credentials = action.payload;
      state.loading = false;
    });
    builder.addCase(registerMatrixAccount.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });
    
    // refreshMatrixToken
    builder.addCase(refreshMatrixToken.fulfilled, (state, action) => {
      state.credentials = action.payload;
    });
  }
});

// Export actions and reducer
export const { setClientInitialized, setSyncState, clearMatrixState } = matrixSlice.actions;
export default matrixSlice.reducer;
