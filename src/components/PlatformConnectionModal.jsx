import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaWhatsapp, FaLock, FaCheck } from 'react-icons/fa';
import { FaTelegram } from 'react-icons/fa6';
import WhatsAppBridgeSetup from './WhatsAppBridgeSetup';
import TelegramConnection from './TelegramConnection';
import logger from '../utils/logger';
import api from '../utils/api';
import { useDispatch, useSelector } from 'react-redux';
import { setWhatsappConnected, updateAccounts } from '../store/slices/onboardingSlice';
import { fetchContacts } from '../store/slices/contactSlice';
import { toast } from 'react-hot-toast';
import '../styles/platformButtons.css';

const PlatformConnectionModal = ({ isOpen, onClose, onConnectionComplete }) => {
  const dispatch = useDispatch();
  const { accounts } = useSelector(state => state.onboarding);
  const [step, setStep] = useState('intro'); // intro, matrix-setup, whatsapp-setup, telegram-setup, success
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

  // Handle Telegram connection completion
  const handleTelegramComplete = (telegramAccount) => {
    logger.info('[PlatformConnectionModal] Telegram connection completed');

    // Update accounts in Redux store
    dispatch(updateAccounts([...accounts, telegramAccount]));

    setStep('success');
  };

  // Handle component mount and check for pre-selected platform
  useEffect(() => {
    if (isOpen) {
      // Check if a platform was pre-selected
      if (window.platformToConnect === 'telegram') {
        setStep('telegram-setup');
        // Clear the selection after using it
        window.platformToConnect = null;
      } else if (window.platformToConnect === 'whatsapp') {
        // Start WhatsApp connection flow
        initializeMatrix();
        // Clear the selection after using it
        window.platformToConnect = null;
      } else {
        setStep('intro');
      }
    }
  }, [isOpen]);

  // Render different steps
  const renderStep = () => {
    switch (step) {
      case 'intro':
        return (
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-6">Connect a Messaging Platform</h3>
            <p className="text-gray-300 mb-8">You need to connect a messaging platform to start using DailyFix.</p>

            <div className="flex justify-center space-x-10 mb-8">
              {/* WhatsApp Button */}
              <div
                className="platform-button group relative"
                onClick={() => initializeMatrix()}
              >
                <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg">
                  <FaWhatsapp className="text-white text-4xl" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-black bg-opacity-70 text-white text-sm py-1 px-3 rounded-lg mt-24">
                    Connect WhatsApp
                  </div>
                </div>
              </div>

              {/* Telegram Button */}
              <div
                className="platform-button group relative"
                onClick={() => setStep('telegram-setup')}
              >
                <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg">
                  <FaTelegram className="text-white text-4xl" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-black bg-opacity-70 text-white text-sm py-1 px-3 rounded-lg mt-24">
                    Connect Telegram
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-700 pt-6 text-left">
              <div className="flex items-start mb-3">
                <FaLock className="text-gray-500 mt-1 mr-2" />
                <p className="text-gray-300">Your messages are end-to-end encrypted and secure.</p>
              </div>
              <div className="flex items-start">
                <FaCheck className="text-green-500 mt-1 mr-2" />
                <p className="text-gray-300">Connect your messaging platforms to manage all your conversations in one place.</p>
              </div>
            </div>
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

      case 'telegram-setup':
        return (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-center">Connect Telegram</h3>
            <TelegramConnection
              onComplete={handleTelegramComplete}
              onCancel={() => setStep('intro')}
            />
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
              Your account has been successfully connected to DailyFix.
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
