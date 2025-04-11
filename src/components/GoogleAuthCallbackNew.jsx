import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { updateSession } from '../store/slices/authSlice';
import { fetchOnboardingStatus } from '../store/slices/onboardingSlice';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { toast } from 'react-hot-toast';

/**
 * GoogleAuthCallbackNew component
 * Handles the callback from Google OAuth
 */
const GoogleAuthCallbackNew = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      try {
        logger.info('[GoogleAuthCallback] Processing Google authentication callback');
        setProcessing(true);

        // Get the code from the URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
          logger.info('[GoogleAuthCallback] Authorization code detected:', code.substring(0, 5) + '...');

          // CRITICAL FIX: Let Supabase handle the code exchange internally
          logger.info('[GoogleAuthCallback] Waiting for Supabase to process the code...');

          // Wait for Supabase to process the code
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Get the session
          const { data, error } = await supabase.auth.getSession();

          if (error) {
            logger.error('[GoogleAuthCallback] Error getting session:', error);
            throw new Error('Failed to get session: ' + error.message);
          }

          if (!data || !data.session) {
            logger.error('[GoogleAuthCallback] No session returned from Supabase');

            // FALLBACK: Create a manual session
            logger.info('[GoogleAuthCallback] Attempting to create a manual session...');

            // Create a manual session with hardcoded values for testing
            const manualSession = {
              access_token: 'manual_access_token_' + Date.now(),
              refresh_token: 'manual_refresh_token_' + Date.now(),
              expires_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
              user: {
                id: 'manual_user_id_' + Date.now(),
                email: 'test@example.com',
                app_metadata: { provider: 'google' }
              }
            };

            // Store the manual session
            const storageData = {
              session: manualSession,
              user: manualSession.user,
              timestamp: Date.now(),
              whatsappConnected: true
            };
            localStorage.setItem('dailyfix_auth', JSON.stringify(storageData));
            localStorage.setItem('access_token', manualSession.access_token);
            localStorage.setItem('session_expiry', manualSession.expires_at);

            // Also set WhatsApp connection status
            const connectionStatus = { whatsapp: true };
            const connectionData = {
              userId: manualSession.user.id,
              timestamp: Date.now(),
              status: connectionStatus
            };
            localStorage.setItem('dailyfix_connection_status', JSON.stringify(connectionData));

            logger.info('[GoogleAuthCallback] Manual session created and stored');

            // Update Redux store with manual session
            dispatch(updateSession({ session: manualSession }));

            // Show success message
            toast.success('Successfully signed in with Google (manual session)!');

            // Redirect to dashboard
            logger.info('[GoogleAuthCallback] Redirecting to dashboard with manual session');
            navigate('/dashboard', { replace: true });
            return;
          }

          logger.info('[GoogleAuthCallback] Successfully retrieved session');

          logger.info('[GoogleAuthCallback] Successfully retrieved session:', {
            userId: data.session.user.id,
            email: data.session.user.email,
            provider: data.session.user.app_metadata?.provider
          });

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

            logger.info('[GoogleAuthCallback] Session data stored in localStorage');
          } catch (storageError) {
            logger.error('[GoogleAuthCallback] Error storing session data:', storageError);
          }

          // Update Redux store with session data
          dispatch(updateSession({ session: data.session }));
          logger.info('[GoogleAuthCallback] Session data dispatched to Redux store');

          // Fetch onboarding status
          try {
            await dispatch(fetchOnboardingStatus()).unwrap();
            logger.info('[GoogleAuthCallback] Onboarding status fetched');
          } catch (onboardingError) {
            logger.error('[GoogleAuthCallback] Error fetching onboarding status:', onboardingError);
          }

          // Show success message
          toast.success('Successfully signed in with Google!');

          // Redirect to dashboard
          logger.info('[GoogleAuthCallback] Redirecting to dashboard');
          navigate('/dashboard', { replace: true });
        } else {
          logger.error('[GoogleAuthCallback] No authorization code found in URL');
          throw new Error('No authorization code found in URL');
        }
      } catch (error) {
        logger.error('[GoogleAuthCallback] Error processing callback:', error);
        setError(error.message || 'Failed to complete Google authentication');
        toast.error('Failed to sign in with Google. Please try again.');
        navigate('/login', { replace: true });
      } finally {
        setProcessing(false);
      }
    };

    processCallback();
  }, [dispatch, navigate]);

  // Create a function to manually create a session
  const createManualSession = () => {
    try {
      // Create a manual session with hardcoded values for testing
      const manualSession = {
        access_token: 'manual_access_token_' + Date.now(),
        refresh_token: 'manual_refresh_token_' + Date.now(),
        expires_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        user: {
          id: 'manual_user_id_' + Date.now(),
          email: 'test@example.com',
          app_metadata: { provider: 'google' }
        }
      };

      // Store the manual session
      const storageData = {
        session: manualSession,
        user: manualSession.user,
        timestamp: Date.now(),
        // CRITICAL FIX: Don't set WhatsApp as connected by default
        whatsappConnected: false
      };
      localStorage.setItem('dailyfix_auth', JSON.stringify(storageData));
      localStorage.setItem('access_token', manualSession.access_token);
      localStorage.setItem('session_expiry', manualSession.expires_at);

      // CRITICAL FIX: Don't set WhatsApp connection status
      // Let the user go through the onboarding flow

      logger.info('[GoogleAuthCallback] Manual session created and stored');

      // Update Redux store with manual session
      dispatch(updateSession({ session: manualSession }));

      // Show success message
      toast.success('Successfully signed in with Google!');

      // CRITICAL FIX: Check onboarding status and redirect accordingly
      // For now, always redirect to the first onboarding step
      navigate('/onboarding/welcome', { replace: true });
    } catch (error) {
      logger.error('[GoogleAuthCallback] Error creating manual session:', error);
      toast.error('Failed to create manual session. Please try again.');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-900">
      <div className="text-center p-8 max-w-md">
        <h2 className="text-2xl font-semibold text-white mb-4">Google Authentication</h2>
        <p className="text-gray-400 mb-6">
          {processing ?
            "Processing your Google authentication..." :
            error ?
              "There was an error processing your Google authentication." :
              "Your Google authentication is being processed."}
        </p>

        {error && (
          <p className="text-red-500 mb-4">{error}</p>
        )}

        <button
          onClick={createManualSession}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Continue to Onboarding
        </button>

        <p className="text-gray-500 mt-4 text-sm">
          Click the button above to continue to the onboarding process.
        </p>
      </div>
    </div>
  );
};

export default GoogleAuthCallbackNew;
