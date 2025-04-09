import React, {useState} from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { updateOnboardingStep, ONBOARDING_STEPS, ONBOARDING_ROUTES } from '../store/slices/onboardingSlice';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';

const ProtocolSelection = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [load, setLoad] = useState(false);

  const handleWhatsAppSelection = async () => {
    try {
      // Show loading toast
      setLoad(true)
      // const loadingToast = toast.loading('Initializing connection...');
      logger.info('[ProtocolSelection] Selected WhatsApp platform');

      // First update the onboarding step to matrix
      await dispatch(updateOnboardingStep({ 
        step: ONBOARDING_STEPS.MATRIX
      })).unwrap();

      // Call the auto-initialize endpoint directly through API
      // The headers will be automatically set by the API interceptor
      const response = await api.post('/api/v1/matrix/auto-initialize');
      
      if (response.data.status !== 'active') {
        throw new Error(response.data.message || 'Failed to initialize Matrix connection');
      }

      // Update onboarding step to WhatsApp
      await dispatch(updateOnboardingStep({ 
        step: ONBOARDING_STEPS.WHATSAPP,
        data: { 
          matrixConnected: true,
          connectedPlatforms: ['matrix']
        }
      })).unwrap();
      
      // Success and navigate
      setLoad(false)
      toast.success('Initiating whatsapp connection!');
      toast.dismiss(loadingToast);
      navigate(ONBOARDING_ROUTES.WHATSAPP);
    } catch (error) {
      logger.error('[ProtocolSelection] Error:', error);
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Failed to initialize connection. Please try again.';
      toast.error(errorMessage);
      // toast.dismiss(loadingToast);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">
        Choose Your Messaging Platform
      </h2>
      
      <div className="grid grid-cols-2 gap-4">
        {/* WhatsApp - Enabled */}
        <button
          onClick={handleWhatsAppSelection}
          className={`p-6 border border-gray-700 rounded-lg bg-dark-lighter hover:bg-dark/50 transition-colors text-left relative group ${
            load 
              ? 'bg-gray-700 cursor-not-allowed opacity-50'
              : 'hover:bg-gray-700'
          }`}
        >
          <div className="absolute top-4 right-4 bg-green-500/20 text-green-500 px-3 py-1 rounded-full text-sm">
            Available
          </div>
          
          <h3 className={`text-xl font-semibold text-gray-400 mb-2 flex items-center ${
              load 
                ? 'bg-gray-700 cursor-not-allowed opacity-50'
                : 'hover:bg-gray-700'
            }`}>
            {load ? 'getting ready..' : 'WhatsApp'}
            <span className="text-2xl mr-3">📱</span>
            
          </h3>
          
          <p className={`text-gray-500 text-sm ${
              load 
                ? 'bg-gray-700 cursor-not-allowed opacity-50'
                : 'hover:bg-gray-700'
            }`}>
            Connect your WhatsApp account to manage messages and contacts.
          </p>
        </button>

        {/* iMessage - Disabled */}
        <button
          disabled
          className="p-6 border border-gray-700 rounded-lg bg-dark-lighter text-left cursor-not-allowed opacity-50"
        >
          <div className="absolute top-4 right-4 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-sm">
            Coming Soon
          </div>
          
          <h3 className="text-xl font-semibold text-gray-400 mb-2 flex items-center">
            <span className="text-2xl mr-3">💬</span>
            iMessage
          </h3>
          
          <p className="text-gray-500 text-sm">
            Manage your iMessage conversations and contacts.
          </p>
        </button>

        {/* Telegram - Disabled */}
        <button
          disabled
          className="p-6 border border-gray-700 rounded-lg bg-dark-lighter text-left cursor-not-allowed opacity-50"
        >
          <div className="absolute top-4 right-4 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-sm">
            Coming Soon
          </div>
          
          <h3 className="text-xl font-semibold text-gray-400 mb-2 flex items-center">
            <span className="text-2xl mr-3">✈️</span>
            Telegram
          </h3>
          
          <p className="text-gray-500 text-sm">
            Connect your Telegram account for message management.
          </p>
        </button>

        {/* Instagram - Disabled */}
        <button
          disabled
          className="p-6 border border-gray-700 rounded-lg bg-dark-lighter text-left cursor-not-allowed opacity-50"
        >
          <div className="absolute top-4 right-4 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-sm">
            Coming Soon
          </div>
          
          <h3 className="text-xl font-semibold text-gray-400 mb-2 flex items-center">
            <span className="text-2xl mr-3">📸</span>
            Instagram
          </h3>
          
          <p className="text-gray-500 text-sm">
            Manage your Instagram direct messages and interactions.
          </p>
        </button>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          More messaging platforms will be available in future updates.
        </p>
      </div>
    </div>
  );
};

export default ProtocolSelection; 