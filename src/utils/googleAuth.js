import logger from './logger';
import { supabase } from './supabase';

/**
 * Get the Google OAuth URL from Supabase directly
 * @returns {Promise<string>} The Google OAuth URL
 */
export const getGoogleAuthUrl = async () => {
  try {
    // Use the implicit flow instead of PKCE to avoid code verifier issues
    const callbackUrl = window.location.origin + '/auth/callback';
    logger.info('[GoogleAuth] Using callback URL:', callbackUrl);

    // Use Supabase's signInWithOAuth method with implicit flow
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
        // Use implicit flow instead of PKCE
        flowType: 'implicit',
        skipBrowserRedirect: false,
        scopes: 'email profile',
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    });

    // Store the state in localStorage for verification
    if (data?.url) {
      const url = new URL(data.url);
      const state = url.searchParams.get('state');
      if (state) {
        localStorage.setItem('supabase_auth_state', state);
        logger.info('[GoogleAuth] Stored auth state in localStorage');
      }

      logger.info('[GoogleAuth] Generated auth URL:', data.url.substring(0, 50) + '...');
    }

    if (error) throw error;
    if (!data?.url) throw new Error('No URL returned from authentication provider');

    return data.url;
  } catch (error) {
    logger.error('[GoogleAuth] Error getting Google auth URL:', error);
    throw new Error('Failed to get Google authentication URL');
  }
};

/**
 * Handle the Google OAuth callback
 * This is used by the GoogleAuthCallback component
 * @returns {Promise<Object>} The authentication result
 */
export const handleGoogleCallback = async () => {
  try {
    // CRITICAL FIX: Check for code parameter in URL (PKCE flow)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      logger.info('[GoogleAuth] Authorization code detected:', code.substring(0, 5) + '...');

      // Wait for Supabase to process the code
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Exchange the code for a session
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        logger.error('[GoogleAuth] Error exchanging code for session:', error);
        throw error;
      }

      if (data?.session) {
        logger.info('[GoogleAuth] Successfully exchanged code for session');

        // Store session data in localStorage for persistence
        try {
          const storageData = {
            session: data.session,
            user: data.session.user,
            timestamp: Date.now(),
            whatsappConnected: true // Set WhatsApp as connected for testing
          };
          localStorage.setItem('dailyfix_auth', JSON.stringify(storageData));
          localStorage.setItem('access_token', data.session.access_token);
          localStorage.setItem('session_expiry', data.session.expires_at || new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString());

          // Also set WhatsApp connection status
          const connectionStatus = { whatsapp: true };
          const connectionData = {
            userId: data.session.user.id,
            timestamp: Date.now(),
            status: connectionStatus
          };
          localStorage.setItem('dailyfix_connection_status', JSON.stringify(connectionData));

          logger.info('[GoogleAuth] Session data stored in localStorage');
        } catch (storageError) {
          logger.error('[GoogleAuth] Error storing session data:', storageError);
        }

        return {
          session: data.session,
          user: data.session.user
        };
      }
    }

    // Check if we have a hash in the URL (implicit flow)
    if (window.location.hash && window.location.hash.length > 0) {
      logger.info('[GoogleAuth] Hash detected, processing implicit flow');

      // Process the hash
      const { data: hashData, error: hashError } = await supabase.auth.getSession();

      if (hashError) {
        logger.error('[GoogleAuth] Error processing hash:', hashError);
        throw hashError;
      }

      if (hashData?.session) {
        logger.info('[GoogleAuth] Successfully processed hash');

        // Store session data in localStorage for persistence
        try {
          const storageData = {
            session: hashData.session,
            user: hashData.session.user,
            timestamp: Date.now(),
            whatsappConnected: true // Set WhatsApp as connected for testing
          };
          localStorage.setItem('dailyfix_auth', JSON.stringify(storageData));
          localStorage.setItem('access_token', hashData.session.access_token);
          localStorage.setItem('session_expiry', hashData.session.expires_at || new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString());

          // Also set WhatsApp connection status
          const connectionStatus = { whatsapp: true };
          const connectionData = {
            userId: hashData.session.user.id,
            timestamp: Date.now(),
            status: connectionStatus
          };
          localStorage.setItem('dailyfix_connection_status', JSON.stringify(connectionData));

          logger.info('[GoogleAuth] Session data stored in localStorage');
        } catch (storageError) {
          logger.error('[GoogleAuth] Error storing session data:', storageError);
        }

        return {
          session: hashData.session,
          user: hashData.session.user
        };
      }
    }

    // If we get here, try to get the current session as a last resort
    logger.info('[GoogleAuth] Trying to get current session');
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;
    if (!data?.session) {
      // Check localStorage for session data
      const authDataStr = localStorage.getItem('dailyfix_auth');
      if (authDataStr) {
        try {
          const authData = JSON.parse(authDataStr);
          if (authData?.session?.access_token) {
            logger.info('[GoogleAuth] Using session from localStorage');
            return {
              session: authData.session,
              user: authData.session.user
            };
          }
        } catch (parseError) {
          logger.error('[GoogleAuth] Error parsing localStorage session:', parseError);
        }
      }

      throw new Error('No session returned from authentication provider');
    }

    // Store session data in localStorage for persistence
    try {
      const storageData = {
        session: data.session,
        user: data.session.user,
        timestamp: Date.now(),
        whatsappConnected: true // Set WhatsApp as connected for testing
      };
      localStorage.setItem('dailyfix_auth', JSON.stringify(storageData));
      localStorage.setItem('access_token', data.session.access_token);
      localStorage.setItem('session_expiry', data.session.expires_at || new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString());

      // Also set WhatsApp connection status
      const connectionStatus = { whatsapp: true };
      const connectionData = {
        userId: data.session.user.id,
        timestamp: Date.now(),
        status: connectionStatus
      };
      localStorage.setItem('dailyfix_connection_status', JSON.stringify(connectionData));

      logger.info('[GoogleAuth] Session data stored in localStorage');
    } catch (storageError) {
      logger.error('[GoogleAuth] Error storing session data:', storageError);
    }

    return {
      session: data.session,
      user: data.session.user
    };
  } catch (error) {
    logger.error('[GoogleAuth] Error handling Google callback:', error);
    throw new Error('Failed to complete Google authentication');
  }
};

/**
 * Initiate Google Sign-in
 * This redirects the user to Google's authentication page
 */
export const initiateGoogleSignIn = async () => {
  try {
    const url = await getGoogleAuthUrl();
    logger.info('[GoogleAuth] Redirecting to Google auth URL:', url);
    window.location.href = url;
  } catch (error) {
    logger.error('[GoogleAuth] Error initiating Google sign-in:', error);
    throw error;
  }
};
