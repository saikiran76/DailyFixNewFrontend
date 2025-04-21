import React, { useState, useEffect } from 'react';
import { FiX, FiArrowRight, FiArrowLeft } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import logger from '../utils/logger';

/**
 * OnboardingTooltip - A component for displaying guided tooltips during user onboarding
 *
 * @param {Object} props
 * @param {string} props.position - Position of the tooltip (top, right, bottom, left)
 * @param {string} props.title - Title of the tooltip
 * @param {string} props.content - Content of the tooltip
 * @param {boolean} props.isVisible - Whether the tooltip is visible
 * @param {function} props.onNext - Function to call when the next button is clicked
 * @param {function} props.onPrev - Function to call when the previous button is clicked
 * @param {function} props.onClose - Function to call when the close button is clicked
 * @param {boolean} props.isFirst - Whether this is the first tooltip in the sequence
 * @param {boolean} props.isLast - Whether this is the last tooltip in the sequence
 * @param {number} props.step - Current step number
 * @param {number} props.totalSteps - Total number of steps
 * @param {string} props.targetSelector - CSS selector for the target element
 */
const OnboardingTooltip = ({
  position = 'bottom',
  title,
  content,
  isVisible,
  onNext,
  onPrev,
  onClose,
  isFirst = false,
  isLast = false,
  step = 1,
  totalSteps = 1,
  targetSelector,
  delay = 0
}) => {
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);

  // Calculate position based on target element
  useEffect(() => {
    if (!isVisible || !targetSelector) return;

    // Track positioning attempts to avoid infinite loops
    let attempts = 0;
    const MAX_ATTEMPTS = 3; // Reduced to 3 attempts to fail faster
    let positioningTimer = null;

    const positionTooltip = () => {
      attempts++;

      // Try to find the target element
      const targetElement = document.querySelector(targetSelector);

      // If element not found and we haven't exceeded max attempts, try again
      if (!targetElement && attempts < MAX_ATTEMPTS) {
        logger.warn(`[OnboardingTooltip] Target element not found: ${targetSelector} (attempt ${attempts}/${MAX_ATTEMPTS})`);
        // Try again after a short delay
        positioningTimer = setTimeout(positionTooltip, 500);
        return;
      }

      // If we've exceeded max attempts, use fallback positioning
      if (!targetElement && attempts >= MAX_ATTEMPTS) {
        logger.warn(`[OnboardingTooltip] Max attempts (${MAX_ATTEMPTS}) reached for ${targetSelector}, using fallback positioning`);
        // Use fallback positioning in the center of the screen
        setTooltipPosition({
          top: window.innerHeight / 2 - 100,
          left: window.innerWidth / 2 - 150,
        });
        setIsPositioned(true);
        return;
      }

      const targetRect = targetElement.getBoundingClientRect();
      const tooltipElement = document.getElementById('onboarding-tooltip');
      if (!tooltipElement) return;

      const tooltipRect = tooltipElement.getBoundingClientRect();

      // Add a highlight to the target element
      targetElement.classList.add('tour-highlight');

      let top = 0;
      let left = 0;
      let arrowTop = 0;
      let arrowLeft = 0;

      // Special case for platform switcher
      if (targetSelector === '[data-platform-button]') {
        // Position tooltip to the right of the platform switcher with extra emphasis
        top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
        left = targetRect.right + 30; // Add extra space for better visibility with wider tooltip
        arrowTop = tooltipRect.height / 2 - 10;
        arrowLeft = -15; // Make arrow more prominent
      } else {
        // Position based on specified position
        switch (position) {
        case 'top':
          top = targetRect.top - tooltipRect.height - 20; // More space for larger tooltip
          left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
          // Ensure tooltip doesn't go off-screen on the left
          if (left < 20) left = 20;
          // Ensure tooltip doesn't go off-screen on the right
          if (left + tooltipRect.width > window.innerWidth - 20) {
            left = window.innerWidth - tooltipRect.width - 20;
          }
          arrowTop = tooltipRect.height;
          arrowLeft = (targetRect.left + targetRect.width / 2) - left;
          break;
        case 'right':
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
          left = targetRect.right + 20; // More space for larger tooltip
          // Ensure tooltip doesn't go off-screen on the top
          if (top < 20) top = 20;
          // Ensure tooltip doesn't go off-screen on the bottom
          if (top + tooltipRect.height > window.innerHeight - 20) {
            top = window.innerHeight - tooltipRect.height - 20;
          }
          arrowTop = (targetRect.top + targetRect.height / 2) - top;
          arrowLeft = -10;
          break;
        case 'bottom':
          top = targetRect.bottom + 20; // More space for larger tooltip
          left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
          // Ensure tooltip doesn't go off-screen on the left
          if (left < 20) left = 20;
          // Ensure tooltip doesn't go off-screen on the right
          if (left + tooltipRect.width > window.innerWidth - 20) {
            left = window.innerWidth - tooltipRect.width - 20;
          }
          arrowTop = -10;
          arrowLeft = (targetRect.left + targetRect.width / 2) - left;
          break;
        case 'left':
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
          left = targetRect.left - tooltipRect.width - 20; // More space for larger tooltip
          // Ensure tooltip doesn't go off-screen on the top
          if (top < 20) top = 20;
          // Ensure tooltip doesn't go off-screen on the bottom
          if (top + tooltipRect.height > window.innerHeight - 20) {
            top = window.innerHeight - tooltipRect.height - 20;
          }
          arrowTop = (targetRect.top + targetRect.height / 2) - top;
          arrowLeft = tooltipRect.width;
          break;
        default:
          break;
        }
      }

      // Log positioning for debugging
      logger.info(`[OnboardingTooltip] Positioning tooltip for ${targetSelector}:`, {
        targetRect: {
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: targetRect.height
        },
        position,
        tooltipPosition: { top, left }
      });

      // Ensure tooltip stays within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < 20) left = 20;
      if (left + tooltipRect.width > viewportWidth - 20) {
        left = viewportWidth - tooltipRect.width - 20;
      }

      if (top < 20) top = 20;
      if (top + tooltipRect.height > viewportHeight - 20) {
        top = viewportHeight - tooltipRect.height - 20;
      }

      setTooltipPosition({ top, left });
      setArrowPosition({ top: arrowTop, left: arrowLeft });
      setIsPositioned(true);
    };

    // Position after a short delay to ensure DOM is ready
    const timer = setTimeout(() => {
      positionTooltip();

      // Add resize listener
      window.addEventListener('resize', positionTooltip);

      // Add scroll listener
      window.addEventListener('scroll', positionTooltip);

      // Highlight target element
      const targetElement = document.querySelector(targetSelector);
      if (targetElement) {
        // Check if this is a tour (from TourGuideButton) or regular onboarding
        const isTour = window.location.hash === '#tour';
        targetElement.classList.add(isTour ? 'tour-highlight' : 'tooltip-highlight');
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      if (positioningTimer) {
        clearTimeout(positioningTimer);
      }
      window.removeEventListener('resize', positionTooltip);
      window.removeEventListener('scroll', positionTooltip);

      // Remove highlight from target element
      const targetElement = document.querySelector(targetSelector);
      if (targetElement) {
        // Remove both possible highlight classes
        targetElement.classList.remove('tooltip-highlight');
        targetElement.classList.remove('tour-highlight');
      }
    };
  }, [isVisible, targetSelector, position, delay]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          id="onboarding-tooltip"
          className="fixed z-[9999] bg-gray-800 text-white rounded-lg shadow-lg p-6 max-w-md w-[400px] border-2 border-purple-500"
          style={{
            top: isPositioned ? tooltipPosition.top : '50%',
            left: isPositioned ? tooltipPosition.left : '50%',
            transform: isPositioned ? 'none' : 'translate(-50%, -50%)',
          }}
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.3, type: 'spring', stiffness: 300 }}
        >
          {/* Arrow based on position */}
          <div
            className={`absolute w-0 h-0 border-solid ${
              position === 'top'
                ? 'border-t-gray-800 border-t-8 border-x-transparent border-x-8 border-b-0'
                : position === 'right'
                ? 'border-r-gray-800 border-r-8 border-y-transparent border-y-8 border-l-0'
                : position === 'bottom'
                ? 'border-b-gray-800 border-b-8 border-x-transparent border-x-8 border-t-0'
                : 'border-l-gray-800 border-l-8 border-y-transparent border-y-8 border-r-0'
            }`}
            style={{
              top: arrowPosition.top,
              left: arrowPosition.left,
            }}
          />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-transparent w-auto text-gray-400 hover:text-white"
            aria-label="Close tooltip"
          >
            <FiX size={18} />
          </button>

          {/* Title */}
          <h3 className="font-bold text-xl mb-3">{title}</h3>

          {/* Content */}
          <p className="text-base leading-relaxed text-gray-200 mb-4">{content}</p>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-2">
            <div className="text-sm font-medium bg-gray-700 px-3 py-1 rounded-md text-gray-200">
              Step {step} of {totalSteps}
            </div>
            <div className="flex space-x-2">
              {!isFirst && (
                <button
                  onClick={onPrev}
                  className="flex items-center text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-md transition-colors"
                >
                  <FiArrowLeft className="mr-2" size={16} />
                  Prev
                </button>
              )}
              {!isLast ? (
                <button
                  onClick={onNext}
                  className="flex items-center text-sm bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-md font-medium transition-colors"
                >
                  Next
                  <FiArrowRight className="ml-2" size={16} />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="flex items-center text-sm bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-md font-medium transition-colors"
                >
                  Got it!
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingTooltip;
