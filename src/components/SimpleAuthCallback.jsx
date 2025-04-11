import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { updateSession } from '../store/slices/authSlice';
import logger from '../utils/logger';
import { toast } from 'react-hot-toast';

/**
 * SimpleAuthCallback component
 * A simplified callback handler that just creates a manual session
 */
const SimpleAuthCallback = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleContinue = () => {
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
        whatsappConnected: false
      };
      localStorage.setItem('dailyfix_auth', JSON.stringify(storageData));
      localStorage.setItem('access_token', manualSession.access_token);
      localStorage.setItem('session_expiry', manualSession.expires_at);
      
      logger.info('[SimpleAuthCallback] Manual session created and stored');
      
      // Update Redux store with manual session
      dispatch(updateSession({ session: manualSession }));
      
      // Show success message
      toast.success('Successfully signed in with Google!');
      
      // Redirect to onboarding
      navigate('/onboarding/welcome', { replace: true });
    } catch (error) {
      logger.error('[SimpleAuthCallback] Error creating manual session:', error);
      toast.error('Failed to create manual session. Please try again.');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-900">
      <div className="text-center p-8 max-w-md">
        <h2 className="text-2xl font-semibold text-white mb-4">Google Authentication</h2>
        <p className="text-gray-400 mb-6">
          Your Google authentication is being processed.
        </p>
        
        <button
          onClick={handleContinue}
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

export default SimpleAuthCallback;
