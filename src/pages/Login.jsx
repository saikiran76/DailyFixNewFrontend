import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { signIn, signInWithGoogle } from '../store/slices/authSlice';
import { toast } from 'react-hot-toast';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import logger from '../utils/logger';
import bgLeft from '../images/loginbg.png'
import bgRight from '../images/loginbg2.png'
import '../styles/BorderStyles.css'

const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { session, loading, googleAuthPending } = useSelector((state) => state.auth);
  const { isComplete } = useSelector((state) => state.onboarding);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  // const [syncProgress, setSyncProgress] = useState(null);

  // Removed auto-clear of error on input change so that error remains visible
  // useEffect(() => {
  //   if (formError) {
  //     setFormError(null);
  //   }
  // }, [email, password]);

  useEffect(() => {
    if (session) {
      logger.info('[Login] Session found, checking onboarding status:', isComplete);
      if (isComplete) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    }
  }, [session, isComplete, navigate]);

  const validateForm = () => {
    if (!email.trim()) {
      setFormError('Email is required');
      return false;
    }
    if (!email.includes('@')) {
      setFormError('Please enter a valid email address');
      return false;
    }
    if (!password) {
      setFormError('Password is required');
      return false;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  // const loadContactsWithRetry = useCallback(async (retryCount = 0) => {
  //   try {
  //     logger.info('[Login] Fetching contacts...');
  //     // Dummy fetchContacts action dispatch
  //     await dispatch({ type: 'contacts/fetchContacts' }).unwrap();
  //   } catch (err) {
  //     logger.error('[Login] Error fetching contacts:', err);
  //     if (retryCount < MAX_RETRIES) {
  //       const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
  //       logger.info(`[Login] Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
  //       setTimeout(() => {
  //         loadContactsWithRetry(retryCount + 1);
  //       }, delay);
  //     } else {
  //       toast.error('Failed to load contacts after multiple attempts');
  //     }
  //   }
  // }, [dispatch]);

  const handleGoogleSignIn = async () => {
    try {
      setFormError(null);
      await dispatch(signInWithGoogle()).unwrap();
      // The page will be redirected by the Google OAuth flow
    } catch (error) {
      logger.error('[Login] Google sign-in error:', error);
      setFormError(error.message || 'Failed to sign in with Google');
      toast.error(error.message || 'Failed to sign in with Google');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    // Do not clear the error here—let it persist until a successful submission or manual dismissal
    // setFormError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      logger.info('[Login] Attempting sign in for:', email);

      // Show loading toast
      // const loadingToast = toast.loading('Signing in...');

      // Dispatch sign in action
      const result = await dispatch(signIn({ email, password })).unwrap();

      logger.info('[Login] Sign in result:', {
        hasSession: !!result?.session,
        hasUser: !!result?.user
      });
      // toast.dismiss(loadingToast);

      if (!result?.session) {
        throw new Error('Invalid login credentials');
        toast.dismiss(loadingToast);
      }

      toast.success('Successfully signed in!');
      // Navigation is handled by useEffect on session
    } catch (error) {
      // toast.dismiss(loadingToast);
      setAttempts(prev => prev + 1);
      logger.error('[Login] Sign in failed:', error);

      // Safely extract error message
      const errorMsg = error?.message || String(error);
      let errorMessage = 'Failed to sign in. Please try again.';

      if (errorMsg.includes('Invalid login credentials') || errorMsg.includes('Invalid login')) {
        errorMessage = 'Invalid email or password. Please check your credentials.';
      } else if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
        errorMessage = 'Account not found. Please check your email or sign up for a new account.';
      } else if (errorMsg.includes('network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (errorMsg.includes('too many')) {
        errorMessage = 'Too many login attempts. Please try again later.';
      } else if (errorMsg.includes('not confirmed')) {
        errorMessage = 'Email not verified. Please check your inbox and verify your email.';
      }

      setFormError(errorMessage);
      toast.error(errorMessage);

      if (attempts >= 2) {
        toast.error('Having trouble? Try resetting your password or contact support.', {
          duration: 5000
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] py-10 px-4 sm:px-6 lg:px-8 relative">
      <div
        className="absolute left-0 top-0 bottom-0 w-[30%]"
        style={{
          backgroundImage: `url(${bgLeft})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      ></div>

      <div
        className="absolute right-0 top-0 bottom-0 w-[30%]"
        style={{
          backgroundImage: `url(${bgRight})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      ></div>
      <div className="max-w-md w-full space-y-8 z-10">
        {/* How It Works Section */}
        {/* <div className="bg-white bg-opacity-10 rounded-lg shadow-md p-6 mb-8 border border-white/10">
          <h3 className="text-xl font-bold text-white/90 mb-4">Note</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="bg-indigo-600 text-white rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0 text-sm font-medium">1</span>
              <div className="flex-1">
                <p className="text-gray-500">Click the site settings icon to the left of the URL above in the browser.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-windigo-600 text-white rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0 text-sm font-medium">2</span>
              <div className="flex-1">
                <p className="text-gray-500">Allow 'Insecure content' setting for the site in the 'Site settings'.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-indigo-600 text-white rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0 text-sm font-medium">3</span>
              <div className="flex-1">
                <p className="text-gray-500">Come back here after allowing the permission in 'Site settings' and start using the application.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-indigo-600 text-white rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0 text-sm font-medium">4</span>
              <div className="flex-1">
                <p className="text-gray-500">When signing up, you'll receive a confirmation email. After clicking verify, even if you see 'unreachable', don't worry! Your account will be confirmed. Return here to login to your verified account.</p>
              </div>
            </div>
          </div>
        </div> */}

        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-200">
            Welcome Back to <span className="text-lime-400">Daily</span><span className="bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">Fix</span>
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              create a new account
            </Link>
          </p>
        </div>

        {/* Render the error message */}
        {formError && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="ml-3 flex-1">
                <p className="text-sm text-red-800">{formError}</p>
              </div>
              <button
                onClick={() => setFormError(null)}
                className="text-white-800 hover:text-red-600 focus:outline-none w-auto"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6 bg-neutral-900 border border-white/10 p-6 rounded-3xl" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>

              <label htmlFor="email-address" className="sr-only text-gray-600">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border ${
                  formError && !email ? 'border-red-300' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm`}
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border ${
                  formError && !password ? 'border-red-300' : 'border-gray-300'
                } placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-10`}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <div className="absolute inset-y-0 right-0 flex items-center ">
                <button
                  type="button"
                  tabIndex="-1"
                  className="px-2 focus:outline-none text-gray-600 hover:text-gray-800 bg-transparent border border-white/10 py-2 rounded-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link to="/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">
                Forgot your password?
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={isSubmitting || loading || googleAuthPending}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                (isSubmitting || loading) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting || loading ? (
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : null}
              {isSubmitting || loading ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-neutral-900 text-gray-400">Or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting || loading || googleAuthPending}
              className={`w-full flex items-center justify-center py-2 px-4 border border-gray-700 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-neutral-800 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                (isSubmitting || loading || googleAuthPending) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {googleAuthPending ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <FcGoogle className="h-5 w-5 mr-2" />
              )}
              {googleAuthPending ? 'Connecting...' : 'Sign in with Google'}
            </button>
          </div>
        </form>

        {attempts >= 2 && (
          <div className="mt-4 text-sm text-gray-600">
            <p className="text-center">
              Forgot your password?{' '}
              <Link to="/reset-password" className="font-medium text-indigo-600 hover:text-indigo-500">
                Reset it here
              </Link>
            </p>
          </div>
        )}

        <div className="mt-3">
          <p className="text-center text-gray-600 text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
