import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Login from '../pages/Login';
import Signup from '../pages/Signup';
import Dashboard from '../pages/Dashboard';
import NewOnboarding from '../pages/NewOnboarding';
import { ForgotPassword } from '../pages/Signup';
import ResetPassword from '../pages/ResetPassword';
import SimpleAuthCallback from '../components/SimpleAuthCallback';
import logger from '../utils/logger';
import { clearProblematicStorage } from '../utils/sessionRecovery';
import { isWhatsAppConnected } from '../utils/connectionStorage';

const AppRoutes = () => {
  // FIXED: Removed unused dispatch
  const { session } = useSelector(state => state.auth);
  const { matrixConnected, whatsappConnected, isComplete, currentStep } = useSelector(state => state.onboarding);

  // Clear problematic localStorage items on mount
  useEffect(() => {
    // CRITICAL FIX: Don't clear localStorage during auth callback
    const isAuthRoute = window.location.pathname.includes('/auth/callback');
    if (!isAuthRoute) {
      // Clear any problematic localStorage items that might be causing issues
      clearProblematicStorage();
      logger.info('[AppRoutes] Cleared problematic localStorage items');
    } else {
      logger.info('[AppRoutes] On auth route, skipping localStorage cleanup');
    }
  }, []);

  // Recovery mechanism for WhatsApp connection state from localStorage
  // This serves as a fallback when the backend fails to update the accounts table
  const whatsappConnectedInLocalStorage = session?.user?.id ? isWhatsAppConnected(session.user.id) : false;

  // Debug log to see values
  logger.info('[AppRoutes] Onboarding state values:', {
    matrixConnected,
    whatsappConnected,
    isComplete,
    currentStep,
    hasSession: !!session,
    whatsappConnectedInLocalStorage
  });

  // Helper function to determine where to redirect after login/signup
  const getPostAuthRedirect = () => {
    // If onboarding is complete or WhatsApp is connected in localStorage, go to dashboard
    if (isComplete || whatsappConnectedInLocalStorage) {
      // CRITICAL FIX: Check if we have a valid session before redirecting to dashboard
      if (session) {
        logger.info('[AppRoutes] Redirecting to dashboard - onboarding complete or WhatsApp connected in localStorage');
        return '/dashboard';
      } else {
        // If onboarding is complete but we don't have a session, something went wrong
        logger.warn('[AppRoutes] Onboarding complete but no session, redirecting to login');
        return '/login';
      }
    }

    // FIXED: Don't use localStorage to determine WhatsApp connection status
    // This was causing the system to think WhatsApp was connected when it wasn't
    // if (isWhatsAppConnected() && matrixConnected) {
    //   logger.info('[AppRoutes] Redirecting to dashboard - WhatsApp connected according to localStorage');
    //   return '/dashboard';
    // }

    // If both platforms are connected, go to dashboard
    if (matrixConnected && whatsappConnected) {
      logger.info('[AppRoutes] Redirecting to dashboard - all platforms connected');
      return '/dashboard';
    }

    // If in the middle of onboarding, go to onboarding page
    if (currentStep !== 'complete' && !isComplete) {
      logger.info('[AppRoutes] Redirecting to onboarding page with current step:', currentStep);
      return '/onboarding';
    }

    // Otherwise start onboarding
    logger.info('[AppRoutes] Starting new onboarding');
    return '/onboarding';
  };

  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          session ? <Navigate to={getPostAuthRedirect()} replace /> : <Login />
        }
      />

      <Route
        path="/signup"
        element={
          session ? <Navigate to={getPostAuthRedirect()} replace /> : <Signup />
        }
      />

      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          !session ? (
            // If we don't have a session, redirect to login
            <Navigate to="/login" replace />
          ) : (
            // If we have a session, show the dashboard
            <Dashboard />
          )
        }
      />

      {/* Onboarding Routes */}
      <Route
        path="/onboarding"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : (
            <NewOnboarding />
          )
        }
      />

      {/* Keep the original onboarding route for backward compatibility */}
      <Route
        path="/onboarding/:step"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : (
            <NewOnboarding />
          )
        }
      />

      {/* Google Auth Callback Route - Handle both our custom callback and Supabase's callback */}
      <Route
        path="/auth/google/callback"
        element={<SimpleAuthCallback />}
      />
      <Route
        path="/auth/callback"
        element={<SimpleAuthCallback />}
      />

      {/* Default Route */}
      <Route
        path="*"
        element={<Navigate to={session ? getPostAuthRedirect() : "/login"} replace />}
      />
    </Routes>
  );
};

export default AppRoutes;