import logger from './logger';
import { supabase } from './supabase';

class TokenManager {
  constructor() {
    this.tokens = new Map();
  }

  async getValidToken(userId = 'default', forceRefresh = false) {
    try {
      // Try to get token from localStorage first
      const dailyfixAuth = localStorage.getItem('dailyfix_auth');
      const accessToken = localStorage.getItem('access_token');

      logger.info('[TokenManager] Checking tokens:', {
        hasDailyfixAuth: !!dailyfixAuth,
        hasAccessToken: !!accessToken,
        userId,
        forceRefresh
      });

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
      // Get refresh token from storage
      const dailyfixAuth = localStorage.getItem('dailyfix_auth');
      if (!dailyfixAuth) {
        throw new Error('No refresh token available');
      }

      const authData = JSON.parse(dailyfixAuth);
      const refreshToken = authData.session?.refresh_token;

      if (!refreshToken) {
        throw new Error('No refresh token in auth data');
      }

      // Use Supabase to refresh the token
      const { data: { session }, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (error || !session) {
        throw error || new Error('Failed to refresh token');
      }

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

      localStorage.setItem('dailyfix_auth', JSON.stringify(newAuthData));
      localStorage.setItem('access_token', session.access_token);

      logger.info('[TokenManager] Token refreshed successfully');
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
}

export const tokenManager = new TokenManager();
export default tokenManager; 