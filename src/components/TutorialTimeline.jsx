import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { updateOnboardingStep } from '../store/slices/onboardingSlice';
import { ONBOARDING_STEPS } from '../store/slices/onboardingSlice';
import logger from '../utils/logger';
import { toast } from 'react-toastify';
import onb1 from '../images/onb1.gif'
import onb2 from '../images/onb2.gif'
import onb3 from '../images/onb3.gif'

// Icons
import { FaRocket, FaRobot, FaChartBar } from 'react-icons/fa';

const TutorialTimeline = ({ onComplete }) => {
  const dispatch = useDispatch();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Tutorial steps content
  const steps = [
    {
      title: "Welcome to DailyFix",
      description: "Connect to multiple platforms in one place. Your messages are end-to-end encrypted, ensuring security across all connected platforms.",
      icon: <FaRocket className="text-4xl text-purple-500" />,
      image: onb1
    },
    {
      title: "AI-Powered Assistance",
      description: "Meet DailyUniAI, your personalized AI assistant that helps you quickly understand and manage your messages across platforms.",
      icon: <FaRobot className="text-4xl text-blue-500" />,
      image: onb2
    },
    {
      title: "Powerful Analytics",
      description: "Get insights about your messaging patterns and communication habits with our analytics dashboard.",
      icon: <FaChartBar className="text-4xl text-green-500" />,
      image: onb3
    }
  ];

  // Handle next step
  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  // Handle previous step
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle completion of tutorial
  const handleComplete = async () => {
    setLoading(true);
    try {
      logger.info('[TutorialTimeline] Completing onboarding tutorial');

      // Update onboarding step to complete
      await dispatch(updateOnboardingStep({
        step: ONBOARDING_STEPS.COMPLETE,
        data: {
          isComplete: true
        }
      })).unwrap();

      logger.info('[TutorialTimeline] Onboarding completed successfully');

      // Call the onComplete callback
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      logger.error('[TutorialTimeline] Error completing onboarding:', error);
      toast.error('Failed to complete onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Animation variants
  const variants = {
    enter: (direction) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction) => ({
      x: direction < 0 ? 1000 : -1000,
      opacity: 0
    })
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto p-6">
      {/* Progress indicator */}
      <div className="flex justify-center w-full mb-8">
        {steps.map((_, index) => (
          <div
            key={index}
            className={`h-2 w-16 mx-1 rounded-full ${
              index <= currentStep ? 'bg-purple-600' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="w-full h-96 relative overflow-hidden">
        <AnimatePresence initial={false} custom={currentStep}>
          <motion.div
            key={currentStep}
            custom={currentStep}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 }
            }}
            className="absolute w-full h-full flex flex-col items-center justify-center"
          >
            <div className="flex flex-col items-center text-center">
              {steps[currentStep].icon}
              <h2 className="text-2xl font-bold mt-4 mb-2">{steps[currentStep].title}</h2>
              <p className="text-gray-600 mb-6 max-w-md">{steps[currentStep].description}</p>

              {/* Illustration with GIF */}
              <div className="w-64 h-64 bg-gray-200 rounded-lg flex items-center justify-center mb-6 overflow-hidden">
                {steps[currentStep].image ? (
                  <img
                    src={steps[currentStep].image}
                    alt={steps[currentStep].title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400">Illustration</span>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between w-full mt-8">
        <button
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className={`px-6 py-2 rounded-lg ${
            currentStep === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Previous
        </button>

        <button
          onClick={handleNext}
          disabled={loading}
          className={`px-6 py-2 rounded-lg ${
            loading
              ? 'bg-purple-400 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700'
          } text-white`}
        >
          {currentStep === steps.length - 1 ? (
            loading ? 'Completing...' : 'Finish'
          ) : (
            'Next'
          )}
        </button>
      </div>
    </div>
  );
};

export default TutorialTimeline;
