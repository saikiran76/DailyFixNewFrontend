import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';
import { useWhatsAppStatus } from '../hooks/useWhatsAppStatus';
import logger from '../utils/logger';

const LoadingSpinner = () => (
  <div className="min-h-screen bg-dark flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const { session, loading: authLoading, initialized, error: authError } = useSelector(state => state.auth);
  const { isComplete, loading: onboardingLoading, error: onboardingError } = useSelector(state => state.onboarding);
  const { status, loading: statusLoading, error: statusError } = useWhatsAppStatus(session?.user?.id);

  // Log state changes
  useEffect(() => {
    logger.info('[ProtectedRoute] Auth state:', {
      initialized,
      hasSession: !!session,
      authLoading,
      userId: session?.user?.id
    });
  }, [initialized, session, authLoading]);

  useEffect(() => {
    logger.info('[ProtectedRoute] Onboarding state:', {
      isComplete,
      onboardingLoading
    });
  }, [isComplete, onboardingLoading]);

  useEffect(() => {
    logger.info('[ProtectedRoute] WhatsApp state:', {
      status,
      statusLoading,
      userId: session?.user?.id
    });
  }, [status, statusLoading, session?.user?.id]);

  // Log errors for debugging
  useEffect(() => {
    if (authError) logger.info('[ProtectedRoute] Auth error:', authError);
    if (onboardingError) logger.info('[ProtectedRoute] Onboarding error:', onboardingError);
    if (statusError) logger.info('[ProtectedRoute] WhatsApp status error:', statusError);
  }, [authError, onboardingError, statusError]);

  // If we're not initialized or loading auth, show loading
  if (!initialized || authLoading) {
    logger.info('[ProtectedRoute] Waiting for auth initialization...');
    return <LoadingSpinner />;
  }

  // If no session, redirect to login
  if (!session) {
    logger.info('[ProtectedRoute] No session found, redirecting to login');
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If we have a session but onboarding is loading, show loading
  if (onboardingLoading) {
    logger.info('[ProtectedRoute] Onboarding status loading...');
    return <LoadingSpinner />;
  }

  // If we have a session but onboarding is not complete, redirect to onboarding
  // unless we're already on the onboarding page
  if (!isComplete && !location.pathname.startsWith('/onboarding')) {
    logger.info('[ProtectedRoute] Onboarding incomplete, redirecting to onboarding');
    return <Navigate to="/onboarding" replace />;
  }

  // If we have a session and onboarding is complete, but WhatsApp status is loading, show loading
  if (statusLoading) {
    logger.info('[ProtectedRoute] WhatsApp status loading...');
    return <LoadingSpinner />;
  }

  logger.info('[ProtectedRoute] All checks passed, rendering children');
  return children;
};

export default ProtectedRoute;