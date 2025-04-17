import { createClient } from '@supabase/supabase-js';
import logger from './utils/logger';

// Get Supabase URL and anon key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Log initialization
logger.info('[Supabase] Client initialized');

// Export a function to get authenticated client
export const getAuthenticatedClient = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    logger.warn('[Supabase] No authenticated session found');
    return supabase;
  }
  
  // Return client with session
  return supabase;
};

// Export a function to get a client with service role (for server-side operations)
export const getServiceClient = (serviceKey) => {
  if (!serviceKey) {
    logger.error('[Supabase] No service key provided');
    return null;
  }
  
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
