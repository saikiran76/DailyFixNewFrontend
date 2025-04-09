import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaWhatsapp, FaLock, FaCheck } from 'react-icons/fa';
import WhatsAppBridgeSetup from './WhatsAppBridgeSetup';
import logger from '../utils/logger';
import api from '../utils/api';
import { useDispatch } from 'react-redux';
import { setWhatsappConnected } from '../store/slices/onboardingSlice';
import { fetchContacts } from '../store/slices/contactSlice';
import { toast } from 'react-toastify';

const PlatformConnectionModal = ({ isOpen, onClose, onConnectionComplete }) => {
  const dispatch = useDispatch();
  const [step, setStep] = useState('intro'); // intro, matrix-setup, whatsapp-setup, success
  const [loading, setLoading] = useState(false);

  // Handle matrix auto-initialization
  const initializeMatrix = async () => {
    setLoading(true);
    try {
      logger.info('[PlatformConnectionModal] Initializing Matrix connection');
      const response = await api.post('/api/v1/matrix/auto-initialize');

      if (response.data.status === 'success') {
        logger.info('[PlatformConnectionModal] Matrix initialized successfully');
        // Proceed to WhatsApp setup
        setStep('whatsapp-setup');
      } else {
        throw new Error('Failed to initialize Matrix');
      }
    } catch (error) {
      logger.error('[PlatformConnectionModal] Error initializing Matrix:', error);

      // Show appropriate error message based on error type
      if (error.response && error.response.status === 500) {
        toast.error('The Matrix service is currently unavailable. Please try again later.');
      } else if (error.response && error.response.status === 401) {
        toast.error('Your session has expired. Please log in again.');
        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        toast.error('Failed to initialize Matrix. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle WhatsApp connection completion
  const handleWhatsAppComplete = () => {
    logger.info('[PlatformConnectionModal] WhatsApp connection completed');
    dispatch(setWhatsappConnected(true));
    setStep('success');
  };

  // Handle final completion
  const handleComplete = () => {
    logger.info('[PlatformConnectionModal] Platform connection process completed');

    // CRITICAL FIX: Dispatch action to fetch contacts
    dispatch(fetchContacts());

    // Call the onConnectionComplete callback if provided
    if (onConnectionComplete) {
      onConnectionComplete();
    }

    // Close the modal
    onClose();

    // Force a page reload to ensure the dashboard shows the connected platform
    // This is a temporary fix until we can properly handle the state updates
    // window.location.reload();
  };

  // Render different steps
  const renderStep = () => {
    switch (step) {
      case 'intro':
        return (
          <div className="text-center">
            <FaWhatsapp className="text-green-500 text-5xl mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-4">Connect WhatsApp</h3>
            <div className="mb-6 text-left">
              <div className="flex items-start mb-3">
                <FaLock className="text-gray-500 mt-1 mr-2" />
                <p className="text-gray-300">Your messages are end-to-end encrypted and secure.</p>
              </div>
              <div className="flex items-start mb-3">
                <FaCheck className="text-green-500 mt-1 mr-2" />
                <p className="text-gray-300">Connect your WhatsApp to manage all your conversations in one place.</p>
              </div>
              <div className="flex items-start">
                <FaCheck className="text-green-500 mt-1 mr-2" />
                <p className="text-gray-300">You'll need to scan a QR code with your phone to complete the connection.</p>
              </div>
            </div>
            <button
              onClick={initializeMatrix}
              disabled={loading}
              className={`w-full py-3 rounded-lg ${
                loading ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'
              } text-white font-medium`}
            >
              {loading ? 'Initializing...' : 'Connect WhatsApp'}
            </button>
          </div>
        );

      case 'whatsapp-setup':
        return (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-center">Scan QR Code</h3>
            <p className="text-gray-600 mb-6 text-center">
              Scan this QR code with your WhatsApp app to connect your account.
            </p>
            <WhatsAppBridgeSetup onComplete={handleWhatsAppComplete} />
          </div>
        );

      case 'success':
        return (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FaCheck className="text-green-500 text-2xl" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Connection Successful!</h3>
            <p className="text-gray-600 mb-6">
              Your WhatsApp account has been successfully connected to DailyFix.
            </p>
            <button
              onClick={handleComplete}
              className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium"
            >
              Continue to Dashboard
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-90 p-4"
          style={{ backdropFilter: 'blur(2px)' }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gradient-to-r bg-black/75 transition-opacity duration-200 ease-in-out rounded-lg shadow-xl max-w-md w-full p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Platform Connection</h2>
              {step !== 'whatsapp-setup' && (
                <button
                  onClick={onClose}
                  className="text-gray-300 hover:text-gray-600 w-auto bg-transparent"
                  aria-label="Close"
                >
                  <FaTimes />
                </button>
              )}
            </div>

            {renderStep()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PlatformConnectionModal;
