import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import OnboardingTooltip from './OnboardingTooltip';
import { setOnboardingComplete } from '../store/slices/onboardingSlice';
import logger from '../utils/logger';

/**
 * OnboardingTooltipManager - Manages the display of onboarding tooltips
 *
 * This component controls the sequence of tooltips shown to users
 * after they connect their first platform or when they request a tour.
 *
 * @param {string} platform - The platform to show tooltips for (whatsapp, telegram, etc.)
 * @param {boolean} forceTour - Whether to force the tour to show regardless of onboarding status
 * @param {function} onComplete - Callback function to call when the tour is complete
 * @param {function} onClose - Callback function to call when the tour is manually closed
 */
const OnboardingTooltipManager = ({ platform, forceTour = false, onComplete, onClose }) => {
  const dispatch = useDispatch();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const { onboardingComplete } = useSelector(state => state.onboarding);

  // Define the tooltip steps based on the platform
  const tooltipSteps = [
    // Step 1: Platform Switcher
    {
      title: "Platform Switcher",
      content: `Switch between your connected ${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} account and other platforms here.`,
      position: "right",
      targetSelector: "[data-platform-button]", // Target the platform switcher button directly
      delay: 500
    },
    // Step 2: Contact List
    {
      title: "Your Contacts",
      content: "All your conversations appear here. Click on any contact to start chatting.",
      position: "right",
      targetSelector: platform === 'whatsapp' ? ".whatsapp-contact-list" : ".telegram-contact-list", // Target the specific contact list
      delay: 300
    },
    // Step 3: Chat View
    {
      title: "Chat Interface",
      content: "Your messages will appear here. Type in the box below to send a message.",
      position: "left",
      targetSelector: platform === 'whatsapp' ? ".whatsapp-chat-view" : ".telegram-chat-view", // Target the specific chat view
      delay: 300
    },
    // Step 4: Settings
    {
      title: "Settings",
      content: "Access your account settings and preferences here.",
      position: "bottom",
      targetSelector: ".settings-button", // Exact class that exists in Sidebar.jsx
      delay: 300
    }
  ];

  // Add platform-specific steps
  if (platform === 'whatsapp') {
    tooltipSteps.push({
      title: "Analytics Dashboard",
      content: "View insights and statistics about your WhatsApp conversations here.",
      position: "bottom",
      targetSelector: ".analytics-button",
      delay: 300
    });
  }

  // Track connected platforms
  const [connectedPlatforms, setConnectedPlatforms] = useState(() => {
    try {
      // Get previously connected platforms from localStorage
      const stored = localStorage.getItem('connected_platforms');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Check if this is the first time the user has connected this platform or if tour is forced
  useEffect(() => {
    if (!platform) return;

    // If we have an onClose prop, this means we're being used from the Sidebar tour guide button
    // In this case, we should show the tooltips immediately
    if (onClose) {
      logger.info(`[OnboardingTooltipManager] Starting manual tour for ${platform}`);
      setIsVisible(true);
      return;
    }

    // Check if this platform was just connected (not in our tracked list)
    const isPlatformNewlyConnected = !connectedPlatforms.includes(platform);

    // Check localStorage for onboarding status
    const onboardingStatus = localStorage.getItem(`${platform}_onboarding_complete`);

    logger.info(`[OnboardingTooltipManager] Platform: ${platform}, newly connected: ${isPlatformNewlyConnected}, onboarding status: ${onboardingStatus}, forceTour: ${forceTour}`);

    // Show tooltips if:
    // 1. This is a forced tour, OR
    // 2. This is a newly connected platform and onboarding hasn't been completed
    if (forceTour || (isPlatformNewlyConnected && !onboardingStatus && !onboardingComplete)) {
      // If not a forced tour, update connected platforms list
      if (!forceTour && isPlatformNewlyConnected) {
        const updatedPlatforms = [...connectedPlatforms, platform];
        setConnectedPlatforms(updatedPlatforms);
        localStorage.setItem('connected_platforms', JSON.stringify(updatedPlatforms));
      }

      // Delay showing the first tooltip to ensure UI is fully loaded
      const timer = setTimeout(() => {
        logger.info(`[OnboardingTooltipManager] Starting ${forceTour ? 'tour' : 'onboarding'} for ${platform}`);
        setIsVisible(true);
      }, forceTour ? 500 : 2000); // Shorter delay for forced tours

      return () => clearTimeout(timer);
    }
  }, [platform, onboardingComplete, connectedPlatforms, forceTour, onClose]);

  // Handle next step
  const handleNext = () => {
    if (currentStep < tooltipSteps.length - 1) {
      setCurrentStep(prevStep => prevStep + 1);
    } else {
      handleClose();
    }
  };

  // Handle previous step
  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prevStep => prevStep - 1);
    }
  };

  // Handle close
  const handleClose = () => {
    setIsVisible(false);

    // If this is not a forced tour, mark onboarding as complete
    if (!forceTour) {
      localStorage.setItem(`${platform}_onboarding_complete`, 'true');
      dispatch(setOnboardingComplete(true));
    }

    logger.info(`[OnboardingTooltipManager] ${forceTour ? 'Tour' : 'Onboarding'} completed for ${platform}`);

    // Call onComplete callback if provided
    if (onComplete) {
      onComplete();
    }

    // Call onClose callback if provided (for manual tour closing)
    if (onClose) {
      onClose();
    }
  };

  // If not visible or no steps, don't render anything
  if (!isVisible || tooltipSteps.length === 0) {
    // Add debug info in development
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[OnboardingTooltipManager] Not rendering tooltips: isVisible=${isVisible}, tooltipSteps.length=${tooltipSteps.length}`);

      // If we have an onClose prop but we're not visible, this might be an issue
      if (onClose && !isVisible) {
        logger.warn('[OnboardingTooltipManager] Tour guide button clicked but tooltips not showing');
      }
    }
    return null;
  }

  const currentTooltip = tooltipSteps[currentStep];

  // Debug info in development
  if (process.env.NODE_ENV === 'development') {
    logger.info(`[OnboardingTooltipManager] Rendering tooltip: step=${currentStep + 1}/${tooltipSteps.length}, target=${currentTooltip.targetSelector}`);

    // Check if target element exists
    const targetElement = document.querySelector(currentTooltip.targetSelector);
    if (!targetElement) {
      logger.warn(`[OnboardingTooltipManager] Target element not found: ${currentTooltip.targetSelector}`);
    } else {
      logger.info(`[OnboardingTooltipManager] Target element found: ${currentTooltip.targetSelector}`);
    }
  }

  return (
    <>
      {/* Debug overlay in development */}
      {process.env.NODE_ENV === 'development' && forceTour && (
        <div className="fixed top-4 left-4 bg-black/80 text-white text-xs p-2 rounded z-[9999]">
          Tour active: Step {currentStep + 1}/{tooltipSteps.length}
        </div>
      )}

      <OnboardingTooltip
        title={currentTooltip.title}
        content={currentTooltip.content}
        position={currentTooltip.position}
        isVisible={isVisible}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={handleClose}
        isFirst={currentStep === 0}
        isLast={currentStep === tooltipSteps.length - 1}
        step={currentStep + 1}
        totalSteps={tooltipSteps.length}
        targetSelector={currentTooltip.targetSelector}
        delay={currentTooltip.delay}
      />
    </>
  );

};

export default OnboardingTooltipManager;
