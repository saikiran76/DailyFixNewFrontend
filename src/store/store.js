import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { authReducer } from './slices/authSlice';
import onboardingReducer from './slices/onboardingSlice';
import { progressReducer } from './slices/progressSlice';
import { contactReducer } from './slices/contactSlice';
import { messageReducer } from './slices/messageSlice';
import socketReducer from './slices/socketSlice';
import logger from '../utils/logger';
import { tokenManager } from '../utils/tokenManager';

// Configure persist for auth state
const authPersistConfig = {
  key: 'auth',
  storage,
  whitelist: ['session', 'user', 'hasInitialized', 'matrixCredentials'] // Persist these fields
};

// Configure persist for onboarding state
const onboardingPersistConfig = {
  key: 'onboarding',
  storage,
  whitelist: ['isComplete', 'currentStep', 'accounts', 'matrixConnected', 'whatsappConnected'] // Persist these fields
};

// Configure persist for contacts
const contactsPersistConfig = {
  key: 'contacts',
  storage,
  whitelist: ['items', 'priorityMap'] // Only persist these fields
};

const persistedAuthReducer = persistReducer(authPersistConfig, authReducer);
const persistedOnboardingReducer = persistReducer(onboardingPersistConfig, onboardingReducer);
const persistedContactReducer = persistReducer(contactsPersistConfig, contactReducer);

// Create auth state middleware
const authMiddleware = (store) => (next) => (action) => {
  // Handle session updates before the action is processed
  if (action.type === 'auth/updateSession') {
    const session = action.payload?.session;

    // Validate session structure before storage
    if (session) {
      if (!session.access_token || !session.refresh_token) {
        logger.error('[Store] Invalid session structure - missing tokens:', {
          hasAccessToken: !!session.access_token,
          hasRefreshToken: !!session.refresh_token
        });
      } else {
        try {
          // Store complete auth data
          const authData = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user: session.user
          };

          localStorage.setItem('dailyfix_auth', JSON.stringify(authData));
          logger.info('[Store] Updated token storage:', { userId: session.user?.id });
        } catch (error) {
          logger.error('[Store] Failed to store auth data:', error);
          // Clear any partial data
          localStorage.removeItem('dailyfix_auth');
        }
      }
    } else if (action.payload?.session === null) {
      // Clear tokens if session is removed
      localStorage.removeItem('dailyfix_auth');
      logger.info('[Store] Cleared token storage');
    }
  }

  // Process the action
  const result = next(action);

  // Track auth state changes
  if (action.type === 'auth/updateSession') {
    const state = store.getState();
    const hadSession = state.auth.session !== null;
    const hasSession = action.payload?.session !== null;
    const userId = action.payload?.session?.user?.id;

    logger.info('[Store] Auth state changed:', {
      hadSession,
      hasSession,
      userId,
      hasStoredTokens: !!localStorage.getItem('dailyfix_auth')
    });
  }

  return result;
};

// Create logging middleware
const loggingMiddleware = (store) => (next) => (action) => {
  logger.info('Dispatching:', action);
  const result = next(action);
  logger.info('Next State:', store.getState());
  return result;
};

const store = configureStore({
  reducer: {
    auth: persistedAuthReducer,
    onboarding: persistedOnboardingReducer,
    progress: progressReducer,
    contacts: persistedContactReducer,
    messages: messageReducer,
    socket: socketReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          'socket/error',
          'auth/setSession',
          'persist/PERSIST',
          'persist/REHYDRATE'
        ],
        ignoredPaths: ['auth.session', 'socket.instance', 'messages.items']
      }
    })
    .concat(authMiddleware)
    .concat(loggingMiddleware),
  devTools: process.env.NODE_ENV !== 'production'
});

export const persistor = persistStore(store);
export default store;