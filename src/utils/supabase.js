import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;

export const getSupabaseClient = () => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'dailyfix_auth',
          storage: {
            getItem: (key) => {
              const data = localStorage.getItem(key);
              return data ? JSON.parse(data) : null;
            },
            setItem: (key, value) => {
              localStorage.setItem(key, JSON.stringify(value));
            },
            removeItem: (key) => {
              localStorage.removeItem(key);
            }
          },
          // Set longer session duration (5 hours)
          flowType: 'pkce',
          sessionExpirySeconds: 5 * 60 * 60 // 5 hours
        }
      }
    );
  }
  return supabaseInstance;
};

// Export a singleton instance
export const supabase = getSupabaseClient();

export default supabase;