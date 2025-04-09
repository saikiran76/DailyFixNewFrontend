import { supabase } from '../utils/supabase';
import logger from '../utils/logger';

class TokenService {
  constructor() {
    this.tokenRefreshPromise = null;
    this.lastRefresh = null;
    this.MIN_TOKEN_LIFETIME = 30000; // 30 seconds
    this.subscribers = new Set();
  }

  async getValidToken() {
    try {
      // Check if we're already refreshing
      if (this.tokenRefreshPromise) {
        return this.tokenRefreshPromise;
      }

      const { data: { session } } = await supabase.auth.getSession();

      logger.info('session fetching at getValidToken', { data: session })
      
      if (!session) {
        throw new Error('No session found');
      }

      // Check if token needs refresh
      if (this.shouldRefreshToken(session)) {
        return this.refreshToken();
      }

      return {
        access_token: session.access_token,
        userId: session.user.id
      };
    } catch (error) {
      logger.error('Failed to get valid token:', error);
      throw error;
    }
  }

  shouldRefreshToken(session) {
    if (!session?.expires_at) return true;
    
    const expiresAt = session.expires_at * 1000; // Convert to milliseconds
    const now = Date.now();
    
    return (expiresAt - now) < this.MIN_TOKEN_LIFETIME;
  }

  async refreshToken() {
    try {
      // Ensure only one refresh at a time
      if (this.tokenRefreshPromise) {
        return this.tokenRefreshPromise;
      }

      this.tokenRefreshPromise = (async () => {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          
          if (error) throw error;
          if (!data.session) throw new Error('No session after refresh');

          this.lastRefresh = Date.now();
          
          const tokenData = {
            access_token: data.session.access_token,
            userId: data.session.user.id
          };

          // Notify subscribers of new token
          this._notifySubscribers(tokenData);
          
          return tokenData;
        } finally {
          this.tokenRefreshPromise = null;
        }
      })();

      return this.tokenRefreshPromise;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  _notifySubscribers(tokenData) {
    this.subscribers.forEach(callback => {
      try {
        callback(tokenData);
      } catch (error) {
        logger.error('Error in token subscriber:', error);
      }
    });
  }

  validateToken(token) {
    if (!token) return false;
    
    try {
      // Basic JWT format validation
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      // Validate header and payload are valid JSON
      const header = JSON.parse(atob(parts[0]));
      const payload = JSON.parse(atob(parts[1]));

      // Check required fields
      if (!header.alg || !payload.exp) return false;

      // Check expiration
      const expiresAt = payload.exp * 1000;
      if (Date.now() >= expiresAt) return false;

      return true;
    } catch (error) {
      logger.error('Token validation failed:', error);
      return false;
    }
  }

  async getValidTokens() {
    try {
      const tokenData = await this.getValidToken();
      return {
        accessToken: tokenData.access_token,
        userId: tokenData.userId
      };
    } catch (error) {
      logger.error('Failed to get valid tokens:', error);
      throw error;
    }
  }
}

export const tokenService = new TokenService();
export default tokenService; 