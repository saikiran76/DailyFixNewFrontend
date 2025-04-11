import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { updateSession } from '../store/slices/authSlice';
import { fetchOnboardingStatus } from '../store/slices/onboardingSlice';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { toast } from 'react-hot-toast';

const GoogleAuthCallback = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Process the callback
        logger.info('[GoogleAuthCallback] Processing Google authentication callback');

        // CRITICAL FIX: Add a longer delay to ensure Supabase has time to process everything
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get the session
        const result = await handleGoogleCallback();

        if (!result || !result.session) {
          throw new Error('Invalid authentication response');
        }

        // CRITICAL FIX: Manually update Redux store with session data
        try {
          await authService.storeSessionData(result.session);
          logger.info('[GoogleAuthCallback] Session data stored in Redux store');
        } catch (storeError) {
          logger.error('[GoogleAuthCallback] Error storing session in Redux:', storeError);
        }

        logger.info('[GoogleAuthCallback] Successfully retrieved session:', {
          userId: result.session.user.id,
          email: result.session.user.email,
          provider: result.session.user.app_metadata?.provider
        });

        // Process the session with authService
        const processedResult = await authService.processGoogleSession(result.session);

        // Fetch onboarding status
        await dispatch(fetchOnboardingStatus()).unwrap();

        // Show success message
        toast.success(processedResult.isNewUser ? 'Account created successfully!' : 'Signed in successfully!');

        // Redirect based on onboarding status
        if (processedResult.isNewUser) {
          navigate('/onboarding');
        } else {
          navigate('/dashboard');
        }
      } catch (error) {
        logger.error('[GoogleAuthCallback] Error processing callback:', error);
        setError(error.message || 'Failed to complete Google authentication');
        toast.error(error.message || 'Failed to complete Google authentication');

        // Redirect to login after error
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } finally {
        setProcessing(false);
      }
    };

    handleCallback();
  }, [dispatch, navigate]);

  if (processing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-900 text-white p-4">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500 mb-4"></div>
        <h2 className="text-2xl font-bold mb-2">Completing Authentication</h2>
        <p className="text-gray-400 text-center max-w-md">
          Please wait while we complete your Google sign-in process...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-900 text-white p-4">
        <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-4 max-w-md">
          <h2 className="text-xl font-bold mb-2">Authentication Error</h2>
          <p>{error}</p>
        </div>
        <p className="text-gray-400">Redirecting to login page...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-900 text-white p-4">
      <div className="bg-green-500/10 border border-green-500 text-green-500 p-4 rounded-lg mb-4 max-w-md">
        <h2 className="text-xl font-bold mb-2">Authentication Successful</h2>
        <p>You have successfully signed in with Google!</p>
      </div>
      <p className="text-gray-400">Redirecting to your dashboard...</p>
    </div>
  );
};

export default GoogleAuthCallback;
