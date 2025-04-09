import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaInfoCircle, FaTimes } from 'react-icons/fa';
import { useSelector } from 'react-redux';
import { isWhatsAppConnected } from '../utils/connectionStorage';
import logger from '../utils/logger';

const TourPopup = ({ onStartTour, onSkipTour }) => {
  const [isVisible, setIsVisible] = useState(true);
  const { whatsappConnected } = useSelector(state => state.onboarding);
  const { session } = useSelector(state => state.auth);

  // Check if WhatsApp is connected in localStorage
  useEffect(() => {
    const userId = session?.user?.id;
    const whatsappConnectedInCache = userId && isWhatsAppConnected(userId);

    // Hide the tour popup if WhatsApp is connected
    if (whatsappConnected || whatsappConnectedInCache) {
      setIsVisible(false);
    }
  }, [whatsappConnected, session]);

  const handleStartTour = () => {
    logger.info('[TourPopup] User opted to start the tour');
    setIsVisible(false);
    if (onStartTour) {
      onStartTour();
    }
  };

  const handleSkipTour = () => {
    logger.info('[TourPopup] User opted to skip the tour');
    setIsVisible(false);
    if (onSkipTour) {
      onSkipTour();
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 flex items-center justify-center z-50 bg-black/75  transition-opacity duration-200 ease-in-out p-4"
          style={{ backdropFilter: 'blur(2px)' }}
        >
          <div
           className="bg-neutral-800 bg-opacity-90 rounded-lg shadow-xl max-w-md w-full p-6"
           style={{ backdropFilter: 'blur(2px)' }}
           >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center">
                <FaInfoCircle className="text-purple-600 bg-opacity-40 text-xl mr-2" />
                <h3 className="text-xl font-semibold">Welcome to DailyFix!</h3>
              </div>
              <button
                onClick={handleSkipTour}
                className="text-gray-400 hover:text-gray-600 w-auto bg-transparent"
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="mb-6 p-2">
              <p className="text-gray-300 mb-4">
                Would you like a quick tour to learn how to get the most out of DailyFix?
              </p>
              <p className="text-gray-300">
                We'll show you how to connect your messaging platforms and use our powerful features.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleSkipTour}
                className="px-4 py-2 border border-gray-700 bg-transparent rounded-lg text-gray-700 hover:bg-gray-100"
              >
                Skip for now
              </button>
              <button
                onClick={handleStartTour}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Start tour
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TourPopup;
