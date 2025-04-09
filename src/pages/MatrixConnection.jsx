import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'react-hot-toast';
import { fetchOnboardingStatus } from '../store/slices/onboardingSlice';
import logger from '../utils/logger';

const DEFAULT_MATRIX_HOMESERVER = 'https://dfix-hsbridge.duckdns.org';

const MatrixConnection = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({
    userId: '',
    password: '',
    homeserver: DEFAULT_MATRIX_HOMESERVER
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Ensure we have a valid session
      if (!session?.user?.id) {
        throw new Error('No valid session found');
      }

      const loadingToast = toast.loading('Connecting to Matrix...');

      // Initialize Matrix client
      const response = await fetch('/api/matrix/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: credentials.userId,
          password: credentials.password,
          homeserver: credentials.homeserver
        })
      });

      if (!response.ok) {
        throw new Error('Failed to connect to Matrix');
      }

      const data = await response.json();

      if (data.status === 'active') {
        toast.success('Matrix connection successful!');
        toast.dismiss(loadingToast);
        
        // Get current onboarding status
        const status = await dispatch(fetchOnboardingStatus()).unwrap();
        
        // Navigate based on WhatsApp connection status
        navigate(status.whatsappConnected ? '/dashboard' : '/whatsapp-connection');
      } else {
        throw new Error(data.message || 'Failed to connect to Matrix');
      }
    } catch (err) {
      logger.error('Matrix connection error:', err);
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-white">
            Connect Matrix Account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Enter your Matrix credentials to connect your account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="userId" className="sr-only">
                Matrix User ID
              </label>
              <input
                id="userId"
                name="userId"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-800 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="@username:example.com"
                value={credentials.userId}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  userId: e.target.value
                }))}
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-800 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  password: e.target.value
                }))}
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : null}
              {loading ? 'Connecting...' : 'Connect Matrix Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MatrixConnection; 