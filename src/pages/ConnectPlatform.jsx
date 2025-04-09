import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api.js';
import { toast } from 'react-hot-toast';
import PlatformSelector from '../components/PlatformSelector';
import supabase from '../utils/supabase.js';
import { initializeSocket, disconnectSocket } from '../utils/socket';
import { useSelector } from 'react-redux';
import logger from '../utils/logger';

const ConnectPlatform = () => {
  const navigate = useNavigate();
  const session = useSelector(state => state.auth.session);
  const { platform } = useParams();
  const [status, setStatus] = useState('initializing');
  const [qrCode, setQrCode] = useState(null);
  const [requiresToken, setRequiresToken] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [connectionState, setConnectionState] = useState('idle');
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  
  // Matrix credentials
  const [matrixCredentials, setMatrixCredentials] = useState({
    username: '',
    password: '',
    homeserver: import.meta.env.VITE_MATRIX_HOMESERVER_URL || 'https://matrix.org'
  });

  // Telegram token
  const [telegramToken, setTelegramToken] = useState('');

  useEffect(() => {
    if (!session) {
      logger.warn('[ConnectPlatform] No session found, redirecting to login');
      navigate('/login');
      return;
    }

    if (platform) {
      initializeConnection();
    }
  }, [platform, session]);

  useEffect(() => {
    const setupSocket = async () => {
      try {
        const newSocket = await initializeSocket();
        if (!newSocket) {
          toast.error('Failed to establish real-time connection');
          return;
        }

        newSocket.on('connect', () => {
          console.log('Socket connected');
        });

        newSocket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          toast.error('Real-time connection failed');
        });

        setSocket(newSocket);
      } catch (error) {
        console.error('Socket initialization error:', error);
        toast.error('Failed to initialize real-time connection');
      }
    };

    setupSocket();

    return () => {
      disconnectSocket();
    };
  }, []);

  // Reference existing socket connection code:
  // connectRoutes.js lines 81-142

  const initializeConnection = async () => {
    try {
      const response = await api.post(`/connect/${platform}/initiate`);
      
      if (response.data.status === 'pending') {
        setStatus('pending');
        if (response.data.requiresLogin) {
          setRequiresLogin(true);
        } else if (response.data.requiresToken) {
          setRequiresToken(true);
        }
      } else if (response.data.status === 'redirect') {
        window.location.href = response.data.url;
      }
    } catch (error) {
      handleConnectionError(error);
    }
  };

  // Platform-specific handlers
  const handleWhatsAppQR = (qrData) => {
    setQrCode(qrData.qrCode);
  };

  const handleTelegramSubmit = async () => {
    try {
      const response = await api.post(`/connect/telegram/finalize`, {
        botToken: telegramToken
      });
      
      if (response.data.status === 'connected') {
        toast.success('Telegram connected successfully!');
        navigate('/dashboard');
      }
    } catch (error) {
      handleConnectionError(error);
    }
  };

  const handleMatrixSubmit = async () => {
    try {
      console.log('Submitting Matrix credentials:', matrixCredentials);
      const response = await api.post(`/connect/matrix/finalize`, matrixCredentials);
      console.log('Matrix connection response:', response.data);
      
      if (response.data.status === 'connected') {
        toast.success('Matrix connected successfully!');
        // Show bridge selection instead of redirecting
        setStatus('select_bridge');
      }
    } catch (error) {
      console.error('Matrix connection error:', error);
      handleConnectionError(error);
    }
  };

  

  // Add bridge selection UI
  const renderBridgeSelection = () => {
    return (
      <div className="max-w-md w-full">
        <h2 className="text-xl mb-4">Select Platforms to Bridge</h2>
        <div className="space-y-4">
          {['whatsapp', 'telegram', 'slack', 'discord'].map(platform => (
            <button
              key={platform}
              onClick={() => initiateBridgeConnection(platform)}
              className="w-full p-3 bg-dark-lighter rounded-lg hover:bg-primary/20"
            >
              Connect {platform.charAt(0).toUpperCase() + platform.slice(1)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Render different forms based on status
  const renderConnectionForm = () => {
    if (requiresLogin) {
      return (
        <div className="max-w-md w-full">
          <h2 className="text-xl mb-4 text-white">Connect to Matrix</h2>
          <form onSubmit={handleMatrixLogin} className="space-y-4">
            <input
              type="text"
              placeholder="Matrix Username"
              value={matrixCredentials.username}
              onChange={(e) => setMatrixCredentials(prev => ({
                ...prev,
                username: e.target.value
              }))}
              className="w-full p-2 border rounded bg-dark-lighter text-white"
              required
              disabled={status === 'connecting'}
            />
            <input
              type="password"
              placeholder="Matrix Password"
              value={matrixCredentials.password}
              onChange={(e) => setMatrixCredentials(prev => ({
                ...prev,
                password: e.target.value
              }))}
              className="w-full p-2 border rounded bg-dark-lighter text-white"
              required
              disabled={status === 'connecting'}
            />
            <button 
              type="submit"
              className="w-full p-2 bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={status === 'connecting'}
            >
              {status === 'connecting' ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </span>
              ) : 'Connect Matrix'}
            </button>
            {errorMessage && (
              <div className="text-red-500 text-sm mt-2">{errorMessage}</div>
            )}
          </form>
        </div>
      );
    }

    if (status === 'select_bridge') {
      return renderBridgeSelection();
    }

    return null;
  };

  const handleConnectionError = (error) => {
    console.error('Connection error:', error);
    setStatus('error');
    setErrorMessage(error.response?.data?.error || error.message || 'Failed to initialize connection');
  };

  async function checkAccountStatus(accessToken) {
    try {
      const response = await api.get('/connect/accounts/status', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data) {
        throw new Error('Invalid response from server');
      }

      return response.data.hasAccounts;
    } catch (error) {
      console.error('Error checking account status:', error);
      if (error.response) {
        throw new Error(error.response.data.error || 'Failed to check account status');
      }
      throw error;
    }
  }

  // Add this helper function for verification retries
  const verifyMatrixAccount = async (maxRetries = 5, delayMs = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
      // Add delay except for first try
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      try {
        const accountResponse = await api.get('/connect/accounts/matrix');
        console.log(`Verification attempt ${i + 1}:`, accountResponse.data);
        
        // Account exists and is active
        if (accountResponse.data && accountResponse.data.credentials) {
          return true;
        }
      } catch (error) {
        console.log(`Verification attempt ${i + 1} failed:`, error.response?.data || error.message);
        // If it's not a 404, throw the error
        if (error.response?.status !== 404) {
          throw error;
        }
      }
    }
    return false;
  };

  const handleMatrixLogin = async (e) => {
    e.preventDefault();
    setStatus('connecting');
    setError(null);

    const loadingToast = toast.loading('Connecting to Matrix...');

    try {
      if (!session) {
        throw new Error('Session expired');
      }

      // Connect to Matrix and create account in one step
      const matrixResponse = await api.post('/connect/matrix/finalize', {
        username: matrixCredentials.username,
        password: matrixCredentials.password,
        homeserver: matrixCredentials.homeserver,
        userId: session.user.id
      });

      console.log('Matrix connection response:', matrixResponse.data);

      if (matrixResponse.data.status === 'connected') {
        // Verify the account with retries
        const isVerified = await verifyMatrixAccount();
        
        if (isVerified) {
          toast.success('Matrix connected successfully! Ready to set up bridges.');
          setStatus('select_bridge');
          
          // Optionally navigate to bridge selection
          navigate('/bridge/select');
        } else {
          console.error('Account verification failed after retries');
          throw new Error('Matrix connected but account verification failed. Please try refreshing the page.');
        }
      } else {
        throw new Error(matrixResponse.data.error || 'Connection failed');
      }
    } catch (error) {
      console.error('Matrix connection error:', error);
      setError(error.response?.data?.error || error.message || 'Failed to connect to Matrix');
      setStatus('error');
      toast.error(error.response?.data?.error || error.message || 'Failed to connect to Matrix');
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  // Helper function to determine next platform to connect
  const getNextPlatformToConnect = async (userId) => {
    try {
      const { data: response } = await api.get('/accounts');
      // Ensure we have an array of accounts
      const accounts = response?.accounts || [];
      const connectedPlatforms = new Set(accounts.map(acc => acc.platform));
      
      const platforms = ['matrix', 'telegram', 'whatsapp', 'slack', 'discord'];
      const nextPlatform = platforms.find(p => !connectedPlatforms.has(p));
      
      // If no next platform is found, return null
      return nextPlatform || null;
    } catch (error) {
      console.error('Error getting next platform:', error);
      return null;
    }
  };

  const handleConnect = async (platform) => {
    setConnectionState('connecting');
    setError(null);

    try {
      const response = await fetch('/api/bridge/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const result = await response.json();
      
      if (result.status === 'connected') {
        setConnectionState('connected');
        // Navigate to dashboard or next step
        navigate('/dashboard');
      } else {
        setConnectionState('error');
        setError('Unexpected response from server');
      }
    } catch (error) {
      setConnectionState('error');
      setError(error.message);
    }
  };

  // Modify initiateBridgeConnection to handle bridge setup properly
  const initiateBridgeConnection = async (platform) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please login again.');
        navigate('/login');
        return;
      }

      const response = await api.post(`/bridge/${platform}/connect`, {
        userId: session.user.id
      });
      
      if (response.data.status === 'connected') {
        toast.success(`${platform} bridge connected successfully!`);
        // Check if there are more platforms to connect
        const remainingPlatforms = await getNextPlatformToConnect(session.user.id);
        if (!remainingPlatforms) {
          // Only navigate when all selected platforms are connected
          navigate('/dashboard');
        }
      }
    } catch (error) {
      toast.error(`Failed to connect ${platform} bridge: ${error.message}`);
      console.error(error);
    }
  };

  if (status === 'select_bridge' || status === 'connecting') {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center p-8">
        {status === 'select_bridge' ? (
          renderBridgeSelection()
        ) : status === 'connecting' ? (
          <div className="text-white">Connecting...</div>
        ) : (
          <div className="text-red-500">{errorMessage}</div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-8">
      {status === 'select_bridge' ? (
        renderBridgeSelection()
      ) : status === 'connecting' ? (
        <div className="text-white">Connecting...</div>
      ) : status === 'error' ? (
        <div className="text-red-500">{errorMessage}</div>
      ) : (
        // Matrix login form
        <form onSubmit={handleMatrixLogin} className="space-y-4">
          <input
            type="text"
            placeholder="Matrix Username"
            value={matrixCredentials.username}
            onChange={(e) => setMatrixCredentials(prev => ({
              ...prev,
              username: e.target.value
            }))}
            className="w-full p-2 border rounded bg-dark-lighter text-white"
            required
            disabled={status === 'connecting'}
          />
          <input
            type="password"
            placeholder="Matrix Password"
            value={matrixCredentials.password}
            onChange={(e) => setMatrixCredentials(prev => ({
              ...prev,
              password: e.target.value
            }))}
            className="w-full p-2 border rounded bg-dark-lighter text-white"
            required
            disabled={status === 'connecting'}
          />
          <button 
            type="submit"
            className="w-full p-2 bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={status === 'connecting'}
          >
            {status === 'connecting' ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Connecting...
              </span>
            ) : 'Connect Matrix'}
          </button>
          {errorMessage && (
            <div className="text-red-500 text-sm mt-2">{errorMessage}</div>
          )}
        </form>
      )}
    </div>
  );
};

export default ConnectPlatform; 