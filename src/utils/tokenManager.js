import logger from './logger';
import { supabase } from './supabase';

class TokenManager {
  constructor() {
    this.tokens = new Map();
  }

  async getValidToken(userId = 'default', forceRefresh = false) {
    try {
      // CRITICAL FIX: Check token expiration
      const checkTokenExpiration = () => {
        const expiryStr = localStorage.getItem('session_expiry');
        if (!expiryStr) return true; // If no expiry, assume expired

        try {
          const expiryTime = new Date(expiryStr).getTime();
          const currentTime = Date.now();
          // Add a 5-minute buffer to ensure we refresh before expiration
          const isExpired = expiryTime - currentTime < 5 * 60 * 1000;

          if (isExpired) {
            logger.info('[TokenManager] Token is expired or expiring soon');
          }

          return isExpired;
        } catch (e) {
          logger.error('[TokenManager] Error checking token expiration:', e);
          return true; // Assume expired on error
        }
      };

      const isTokenExpired = checkTokenExpiration();

      // Try to get token from localStorage first
      const dailyfixAuth = localStorage.getItem('dailyfix_auth');
      const accessToken = localStorage.getItem('access_token');

      logger.info('[TokenManager] Checking tokens:', {
        hasDailyfixAuth: !!dailyfixAuth,
        hasAccessToken: !!accessToken,
        userId,
        forceRefresh,
        isTokenExpired
      });

      // If token is expired or force refresh is requested, refresh immediately
      if (forceRefresh || isTokenExpired) {
        logger.info('[TokenManager] Token expired or force refresh requested, refreshing token');
        return this.refreshToken(userId);
      }

      if (dailyfixAuth) {
        const authData = JSON.parse(dailyfixAuth);
        if ((authData.session?.access_token || authData.access_token) && !forceRefresh) {
          logger.info('[TokenManager] Using token from dailyfix_auth');
          return authData.session?.access_token || authData.access_token;
        }
      }

      if (accessToken && !forceRefresh) {
        logger.info('[TokenManager] Using token from access_token');
        return accessToken;
      }

      // If we get here, we need to refresh the token
      logger.info('[TokenManager] No valid token found, attempting refresh');
      return this.refreshToken(userId);
    } catch (error) {
      logger.info('[TokenManager] Error getting valid token:', error);
      return null;
    }
  }

  async refreshToken(userId = 'default') {
    try {
      logger.info('[TokenManager] Attempting to refresh token');

      // CRITICAL FIX: Try multiple sources for refresh token
      let refreshToken = null;

      // First try to get refresh token from separate localStorage item
      refreshToken = localStorage.getItem('refresh_token');

      // If not found, try to get from dailyfix_auth
      if (!refreshToken) {
        const authData = localStorage.getItem('dailyfix_auth');
        if (authData) {
          const parsedAuthData = JSON.parse(authData);
          if (parsedAuthData.session && parsedAuthData.session.refresh_token) {
            refreshToken = parsedAuthData.session.refresh_token;
          }
        }
      }

      if (!refreshToken) {
        throw new Error('No refresh token found in any storage location');
      }

      logger.info('[TokenManager] Found refresh token, attempting to refresh session');

      // Use Supabase to refresh the token
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (error || !data || !data.session) {
        throw error || new Error('Failed to refresh token');
      }

      const session = data.session;

      // Log the refreshed session details
      logger.info('[TokenManager] Session refreshed successfully:', {
        hasAccessToken: !!session.access_token,
        hasRefreshToken: !!session.refresh_token,
        expiresAt: session.expires_at
      });

      // Update stored tokens
      const newAuthData = {
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          provider_token: session.provider_token,
          provider_refresh_token: session.provider_refresh_token,
          user: session.user
        },
        user: session.user
      };

      // Store all token information
      localStorage.setItem('dailyfix_auth', JSON.stringify(newAuthData));
      localStorage.setItem('access_token', session.access_token);
      localStorage.setItem('refresh_token', session.refresh_token);
      localStorage.setItem('session_expiry', session.expires_at);

      logger.info('[TokenManager] Token refreshed and stored successfully');
      return session.access_token;
    } catch (error) {
      logger.info('[TokenManager] Token refresh failed:', error);
      return null;
    }
  }

  clearTokens(userId = 'default') {
    try {
      localStorage.removeItem('dailyfix_auth');
      localStorage.removeItem('access_token');
      this.tokens.delete(userId);
      logger.info('[TokenManager] Tokens cleared for user:', userId);
    } catch (error) {
      logger.info('[TokenManager] Error clearing tokens:', error);
    }
  }

  setToken(token, userId = 'default') {
    try {
      this.tokens.set(userId, token);
      localStorage.setItem('access_token', token);

      // Ensure the token is also set in the dailyfix_auth object
      const dailyfixAuth = localStorage.getItem('dailyfix_auth');
      if (dailyfixAuth) {
        const authData = JSON.parse(dailyfixAuth);
        if (authData.session) {
          authData.session.access_token = token;
        } else {
          authData.session = {
            access_token: token,
            refresh_token: null,
            expires_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
          };
        }
        localStorage.setItem('dailyfix_auth', JSON.stringify(authData));
      }

      logger.info('[TokenManager] Token set for user:', userId);
    } catch (error) {
      logger.error('[TokenManager] Error setting token:', error);
    }
  }
}

export const tokenManager = new TokenManager();
export default tokenManager;