import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaInfoCircle } from 'react-icons/fa';
import { FiX, FiCheck } from 'react-icons/fi';
import { useSelector } from 'react-redux';
import { isWhatsAppConnected } from '../utils/connectionStorage';
import logger from '../utils/logger';
import DFLogo from '../images/DF.png';
import '../styles/aiAssistant.css';

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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-neutral-900 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-white/10 animate-fadeIn"
          >
            {/* Header with close button */}
            <div className="flex justify-between items-center p-4 border-b border-white/10">
              <h3 className="text-xl font-medium text-white flex items-center">
                <img src={DFLogo} alt="DailyFix Logo" className="w-6 h-6 mr-2" />
                DailyFix Tour
              </h3>
              <button
                onClick={handleSkipTour}
                className="text-gray-400 w-auto hover:text-white transition-colors"
                aria-label="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-24 h-24 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
                  <FaInfoCircle className="w-12 h-12 text-blue-500" />
                </div>
                <h4 className="text-xl font-medium text-white mb-2">Welcome to DailyFix!</h4>
                <p className="text-gray-300 mb-2">
                  Would you like a quick tour to learn how to get the most out of DailyFix?
                </p>
                {/* <p className="text-gray-300">
                  We&apos;ll show you how to connect your messaging platforms and use our powerful features.
                </p> */}
              </div>
            </div>

            {/* Footer with buttons */}
            <div className="p-4 border-t border-white/10 flex justify-between">
              <button
                onClick={handleSkipTour}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Skip for now
              </button>
              <button
                onClick={handleStartTour}
                className="px-3 py-2 w-[8rem] bg-[#0088CC] hover:bg-[#0077BB] text-white rounded-md flex items-center justify-between transition-colors"
              >
                <span>Start </span> <FiCheck/>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TourPopup;
