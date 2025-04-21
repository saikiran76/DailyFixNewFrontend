import { createClient } from '@supabase/supabase-js';
import logger from './utils/logger';

// Get Supabase URL and keys from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

// Create Supabase client with anon key (for client-side operations)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Create Supabase client with service role key (for admin operations)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
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
