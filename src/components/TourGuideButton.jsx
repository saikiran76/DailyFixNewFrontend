import React, { useState } from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import OnboardingTooltipManager from './OnboardingTooltipManager';
import logger from '../utils/logger';

/**
 * TourGuideButton - A persistent help button that allows users to start a guided tour
 * of the interface for any connected platform
 */
const TourGuideButton = () => {
  const [showPlatformSelector, setShowPlatformSelector] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const { accounts } = useSelector(state => state.onboarding);

  // Filter out matrix as it's not a user-facing platform
  const connectedPlatforms = accounts.filter(acc => acc.platform !== 'matrix');

  const handleStartTour = (platform) => {
    logger.info(`[TourGuideButton] Starting tour for ${platform}`);

    // Set hash to indicate this is a tour (used by OnboardingTooltip)
    window.location.hash = 'tour';

    setSelectedPlatform(platform);
    setShowPlatformSelector(false);

    // Force the tooltip to show by clearing the completion status
    localStorage.removeItem(`${platform}_onboarding_complete`);
  };

  const handleTourComplete = () => {
    // Clear the tour hash
    window.location.hash = '';
    setSelectedPlatform(null);

    logger.info('[TourGuideButton] Tour completed');
  };

  return (
    <>
      {/* Tour Guide Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setShowPlatformSelector(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 space-x-2"
          aria-label="Start Tour Guide"
        >
          <FiHelpCircle size={20} />
          <span>Tour Guide</span>
        </button>

        {/* Debug info - only visible in development */}
        {process.env.NODE_ENV === 'development' && selectedPlatform && (
          <div className="absolute top-full mt-2 right-0 bg-black/80 text-white text-xs p-2 rounded">
            Tour active: {selectedPlatform}
          </div>
        )}
      </div>

      {/* Platform Selector Modal */}
      <AnimatePresence>
        {showPlatformSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={() => setShowPlatformSelector(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-white mb-4">Start Tour Guide</h2>
              <p className="text-gray-300 mb-6">
                Select a platform to learn how to use its features:
              </p>

              {connectedPlatforms.length === 0 ? (
                <div className="text-center py-4 text-gray-400">
                  No platforms connected yet. Connect a platform first to start a tour.
                </div>
              ) : (
                <div className="space-y-3">
                  {connectedPlatforms.map(platform => (
                    <button
                      key={platform.id}
                      onClick={() => handleStartTour(platform.platform)}
                      className="w-full py-3 px-4 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg flex items-center transition-colors"
                    >
                      {platform.platform === 'whatsapp' ? (
                        <span className="text-green-500 mr-3 text-xl">📱</span>
                      ) : platform.platform === 'telegram' ? (
                        <span className="text-blue-500 mr-3 text-xl">✈️</span>
                      ) : (
                        <span className="text-gray-500 mr-3 text-xl">💬</span>
                      )}
                      <span className="font-medium capitalize">{platform.platform}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowPlatformSelector(false)}
                className="w-full mt-6 py-2 bg-transparent border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip Manager */}
      {selectedPlatform && (
        <OnboardingTooltipManager
          platform={selectedPlatform}
          forceTour={true}
          onComplete={handleTourComplete}
        />
      )}
    </>
  );
};

export default TourGuideButton;
