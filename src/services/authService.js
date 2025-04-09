import { supabase } from '../utils/supabase';
import { tokenManager } from '../utils/tokenManager';
import logger from '../utils/logger';
import store from '../store/store';
import { updateSession } from '../store/slices/authSlice';

logger.info('AuthService module loaded');

class AuthService {
    constructor() {
        this.initialized = false;
        this.initPromise = null;
        this.lastSessionCheck = 0;
        this.SESSION_CHECK_COOLDOWN = 5000; // 5 seconds
    }

    // New helper method to standardize session storage
    async storeSessionData(session) {
        if (!session?.access_token || !session?.refresh_token || !session?.user) {
            throw new Error('Invalid session data for storage');
        }

        const storageData = {
            session: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_at: session.expires_at,
                provider_token: session.provider_token,
                provider_refresh_token: session.provider_refresh_token,
                user: session.user
            },
            user: session.user
        };

        try {
            // Store main session data
            localStorage.setItem('dailyfix_auth', JSON.stringify(storageData));

            const { data: accounts, error } = await supabase
                            .from('accounts')
                            .select('*')
                            .eq('user_id', session.user.id)
                            .eq('platform', 'matrix')
                            .maybeSingle();

            // If Matrix credentials exist, store them separately
            if (!error && accounts) {
                const matrixCreds = accounts.credentials;
                localStorage.setItem('matrix_credentials', JSON.stringify(matrixCreds));
                logger.info('[AuthService] Matrix credentials stored successfully');
            }

            // Update store only after successful storage
            store.dispatch(updateSession({ session }));
            return true;
        } catch (error) {
            logger.error('[AuthService] Failed to store session data:', error);
            return false;
        }
    }

    // New helper method to clear session data
    clearSessionData() {
        try {
            localStorage.removeItem('dailyfix_auth');
            localStorage.removeItem('access_token');
            tokenManager.clearTokens();
            store.dispatch(updateSession({ session: null }));
        } catch (error) {
            logger.error('[AuthService] Error clearing session data:', error);
        }
    }

    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }

        try {
            this.initPromise = (async () => {
                if (this.initialized) {
                    return;
                }

                // Set up auth state change listener
                supabase.auth.onAuthStateChange(async (event, session) => {
                    logger.info('[AuthService] Auth state changed:', event);
                    
                    if (event === 'SIGNED_IN' && session) {
                        await this.storeSessionData(session);
                    } else if (event === 'SIGNED_OUT') {
                        this.clearSessionData();
                    }
                });

                // Initial session check
                await this.validateSession();
                this.initialized = true;
            })();

            return await this.initPromise;
        } catch (error) {
            logger.error('[AuthService] Initialization error:', error);
            throw error;
        } finally {
            this.initPromise = null;
        }
    }

    async validateSession(force = false) {
        try {
            // Check cooldown unless forced
            if (!force && Date.now() - this.lastSessionCheck < this.SESSION_CHECK_COOLDOWN) {
                logger.info('[AuthService] Session check cooldown active');
                return null;
            }
            this.lastSessionCheck = Date.now();

            // First try to get token from storage
            const authDataStr = localStorage.getItem('dailyfix_auth');
            if (authDataStr) {
                try {
                    const authData = JSON.parse(authDataStr);
                    if (authData.access_token && authData.user) {
                        // Validate the stored token
                        const { data: { user }, error: validateError } = await supabase.auth.getUser(authData.access_token);
                        if (!validateError && user) {
                            logger.info('[AuthService] Using stored token');
                            const validSession = {
                                ...authData,
                                user: user // Use fresh user data from validation
                            };
                            await this.storeSessionData(validSession);
                            return validSession;
                        }
                    }
                } catch (parseError) {
                    logger.error('[AuthService] Error parsing stored auth data:', parseError);
                    this.clearSessionData(); // Clear invalid data
                }
            }

            // Get current session from Supabase
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                logger.error('[AuthService] Session validation error:', error);
                this.clearSessionData();
                return null;
            }

            if (!session) {
                // Try to refresh session
                const { data: { session: refreshedSession }, error: refreshError } = 
                    await supabase.auth.refreshSession();
                
                if (refreshError || !refreshedSession) {
                    logger.error('[AuthService] Session refresh failed:', refreshError);
                    this.clearSessionData();
                    return null;
                }

                // Store refreshed session
                await this.storeSessionData(refreshedSession);
                return refreshedSession;
            }

            // Store current valid session
            await this.storeSessionData(session);
            return session;
        } catch (error) {
            logger.error('[AuthService] Session validation error:', error);
            this.clearSessionData();
            return null;
        }
    }

    async signIn(email, password) {
        try {
            const { data: { session }, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            // Validate session before storing
            if (!session || !session.user || !session.access_token) {
                throw new Error('Invalid session data received');
            }

            // Validate the token immediately
            const { data: { user }, error: validateError } = await supabase.auth.getUser(session.access_token);
            if (validateError || !user) {
                throw new Error('Session validation failed');
            }

            // Store validated session data
            const success = await this.storeSessionData(session);
            if (!success) {
                throw new Error('Failed to store session data');
            }

            return { session, user };
        } catch (error) {
            logger.error('[AuthService] Sign in error:', error);
            // Clear any partial session data
            this.clearSessionData();
            throw error;
        }
    }

    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            this.clearSessionData();
        } catch (error) {
            logger.error('[AuthService] Sign out error:', error);
            throw error;
        }
    }
}

const authService = new AuthService();
export default authService;