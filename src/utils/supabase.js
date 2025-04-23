import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;

export const getSupabaseClient = () => {
  if (!supabaseInstance) {
    // CRITICAL FIX: Add debugging and fallback values for Vercel deployment
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://odpltrqbcognwmxttlpp.supabase.co';
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Log the values for debugging
    console.log('[Supabase] URL:', supabaseUrl);
    console.log('[Supabase] Key exists:', !!supabaseKey);

    supabaseInstance = createClient(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          // CRITICAL FIX: Improve token handling and session persistence
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'dailyfix_auth',
          // Custom storage implementation to handle token updates properly
          storage: {
            getItem: (key) => {
              try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : null;
              } catch (e) {
                console.error('Error getting item from storage:', e);
                return null;
              }
            },
            setItem: (key, value) => {
              try {
                // Store the session data
                localStorage.setItem(key, JSON.stringify(value));

                // CRITICAL FIX: Also store individual tokens for easier access
                if (value && value.session) {
                  if (value.session.access_token) {
                    localStorage.setItem('access_token', value.session.access_token);
                  }
                  if (value.session.refresh_token) {
                    localStorage.setItem('refresh_token', value.session.refresh_token);
                  }
                  if (value.session.expires_at) {
                    localStorage.setItem('session_expiry', value.session.expires_at);
                  }
                }
              } catch (e) {
                console.error('Error setting item in storage:', e);
              }
            },
            removeItem: (key) => {
              try {
                localStorage.removeItem(key);
                // Also remove individual tokens
                if (key === 'dailyfix_auth') {
                  localStorage.removeItem('access_token');
                  localStorage.removeItem('refresh_token');
                  localStorage.removeItem('session_expiry');
                }
              } catch (e) {
                console.error('Error removing item from storage:', e);
              }
            }
          },
          // CRITICAL FIX: Set longer session duration (5 hours)
          // This gives users plenty of time to work without interruption
          flowType: 'pkce',
          sessionExpirySeconds: 5 * 60 * 60, // 5 hours
          // CRITICAL FIX: Configure token refresh behavior
          autoRefreshToken: true,
          persistSession: true
        }
      }
    );
  }
  return supabaseInstance;
};

// Export a singleton instance
export const supabase = getSupabaseClient();

export default supabase;
