// frontend/src/pages/Signup.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import supabase from '../utils/supabase';
import api from '../utils/api';
import '../styles/Login.css';
import logger from '../utils/logger';
import { updateSession } from '../store/slices/authSlice';
import { toast } from 'react-toastify';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import bgLeft from '../images/loginbg.png'
import bgRight from '../images/loginbg2.png'

const getURL = () => {
  let url;
  if (import.meta.env.VITE_ENV === 'production') {
    url = import.meta.env.VITE_SITE_URL ?? 'https://daily-fix-frontend.vercel.app'
  } else {
    url = 'http://localhost:5173'
  }
  // Make sure to include `https://` when not localhost.
  url = url.startsWith('http') ? url : `https://${url}`
  // Make sure to include a trailing `/`.
  url = url.endsWith('/') ? url : `${url}/`
  return url
}

const Signup = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const validateForm = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setVerificationRequired(false);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      logger.info('[Signup] Attempting signup with email:', email);
      
      // Sign up with Supabase
      const { data, signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName
          },
          emailRedirectTo: `${getURL()}login`
        }
      });

      logger.info('[Signup] Supabase response:', { 
        hasData: !!data,
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        error: signUpError
      });

      if (signUpError) throw signUpError;

      // Check if email confirmation is required
      if (data?.user?.identities?.length === 0) {
        logger.info('[Signup] Email confirmation required');
        toast.info('Email verification required! Please check your inbox.');
        setVerificationRequired(true);
        setTimeout(() => {
          navigate('/login');
        }, 5500);
        return;
      }

      if (data?.user && data?.session) {
        logger.info('[Signup] Signup successful, storing session');
        
        // Store complete session in Redux
        dispatch(updateSession({ session: data.session }));
        
        // Store auth data in localStorage
        const authData = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at
        };
        localStorage.setItem('dailyfix_auth', JSON.stringify(authData));
        
        // Update API headers
        api.defaults.headers.common['Authorization'] = `Bearer ${data.session.access_token}`;
        
        logger.info('[Signup] Session stored, navigating to onboarding');
        navigate('/onboarding');
      } else {
        logger.error('[Signup] Missing session data:', {
          user: data?.user,
          session: data?.session,
          identities: data?.user?.identities
        });
        throw new Error('Signup successful but waiting for email confirmation. Please check your email.');
      }
    } catch (error) {
      logger.error('[Signup] Error during signup:', error);
      if (error.message.includes('email confirmation')) {
        setVerificationRequired(true);
      } else {
        setError(error.message || 'Signup failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] relative">
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

      <div className="max-w-md w-full bg-neutral-800 bg-opacity-30 backdrop-blur-sm p-8 rounded-lg shadow-lg z-10">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Register your account</h2>
        {verificationRequired ? (
          <div className="bg-green-500/10 border border-green-500 text-green-500 p-4 rounded mb-4">
            <div className="flex items-center space-x-3">
              <img 
                src="https://cdn4.iconfinder.com/data/icons/social-media-logos-6/512/112-gmail_email_mail-512.png" 
                alt="Gmail" 
                className="w-12 h-10 object-contain"
              />
              <div>
                <p className="font-medium">Verification email sent!</p>
                <p className="text-sm">Please check your email inbox to verify your account.</p>
                <p className="text-sm">You can directly login after confirmation</p>
              </div>
            </div>
          </div>
        ) : error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 bg-neutral-900 border border-white/10 p-6 rounded-3xl">
          <div>
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-3 bg-transparent border border-gray-700 rounded text-white"
              required
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-3 bg-transparent border border-gray-700 rounded text-white"
              required
            />
          </div>
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-dark border border-gray-700 rounded text-white"
              required
            />
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border bg-transparent border-gray-700 rounded text-white pr-10"
              required
              minLength={6}
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                type="button"
                tabIndex="-1"
                className="px-2 focus:outline-none bg-transparent text-gray-400 hover:text-gray-300"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <FiEyeOff className="h-4 w-4" />
                ) : (
                  <FiEye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 bg-transparent border border-gray-700 rounded text-white pr-10"
              required
              minLength={6}
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                type="button"
                tabIndex="-1"
                className="px-2 focus:outline-none bg-transparent text-gray-400 hover:text-gray-300"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <FiEyeOff className="h-4 w-4" />
                ) : (
                  <FiEye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full p-3 bg-gradient-to-r from-purple-400 to-pink-600 text-white rounded transition-all duration-300 ease-in-out hover:bg-gradient-to-r hover:from-lime-500 delay-100 hover:to-lime-600 disabled:opacity-50"
          >
            {isLoading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <p className="text-center text-gray-400 mt-4">
          Already have an account? <Link to="/login" className="text-primary hover:text-primary/80">Login</Link>
        </p>
      </div>
    </div>
  );
};

export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getURL()}reset-password`,
      });

      if (error) throw error;

      setMessage('Check your email for the password reset link');
      toast.success('Password reset email sent! Please check your inbox.');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error) {
      logger.error('[ForgotPassword] Error:', error);
      setMessage(error.message || 'Failed to send reset email');
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark">
      <div className="max-w-md w-full bg-dark-lighter p-8 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Reset Password</h2>
        {message && (
          <div className={`p-4 rounded mb-4 ${
            message.includes('Check your email') 
              ? 'bg-green-500/10 border border-green-500 text-green-500'
              : 'bg-red-500/10 border border-red-500 text-red-500'
          }`}>
            {message}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-dark border border-gray-700 rounded text-white"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full p-3 bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
        <p className="text-center text-gray-400 mt-4">
          Remember your password? <Link to="/login" className="text-primary hover:text-primary/80">Login</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
