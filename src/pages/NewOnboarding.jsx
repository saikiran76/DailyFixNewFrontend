import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  updateOnboardingStep,
  setCurrentStep,
  setIsComplete,
  ONBOARDING_STEPS
} from '../store/slices/onboardingSlice';
import logger from '../utils/logger';
import { toast } from 'react-toastify';
import DFLogo from '../images/DF.png';
import { FiArrowRight, FiCheck } from 'react-icons/fi';
import { FaRocket, FaRobot, FaChartBar } from 'react-icons/fa';
import onb1 from '../images/onb1.gif'
import onb2 from '../images/onb2.gif'
import onb3 from '../images/onb3.gif'

/**
 * Completely redesigned onboarding flow with a simplified 3-step timeline tutorial
 * instead of the complex protocol_selection/matrix/whatsapp flow.
 */
const NewOnboarding = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const { currentStep } = useSelector(state => state.onboarding);

  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If user is not logged in, redirect to login
    if (!session) {
      navigate('/login');
      return;
    }

    // If onboarding is already complete, redirect to dashboard
    if (currentStep === ONBOARDING_STEPS.COMPLETE) {
      navigate('/dashboard');
      return;
    }

    logger.info('[NewOnboarding] Initializing with step:', currentStep);
  }, [session, currentStep, navigate]);

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
    if (activeStep < steps.length - 1) {
      setActiveStep(activeStep + 1);
    } else {
      handleComplete();
    }
  };

  // Handle previous step
  const handlePrevious = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  // Handle completion of tutorial
  const handleComplete = async () => {
    setLoading(true);
    try {
      logger.info('[NewOnboarding] Completing onboarding tutorial');

      // CRITICAL FIX: Directly update Redux state without API call
      dispatch(setCurrentStep('complete'));
      dispatch(setIsComplete(true));

      // Also update localStorage for persistence
      try {
        const onboardingData = localStorage.getItem('persist:onboarding');
        if (onboardingData) {
          const parsedData = JSON.parse(onboardingData);
          parsedData.currentStep = JSON.stringify('complete');
          parsedData.isComplete = JSON.stringify(true);
          localStorage.setItem('persist:onboarding', JSON.stringify(parsedData));
        }
      } catch (storageError) {
        logger.error('[NewOnboarding] Error updating localStorage:', storageError);
      }

      logger.info('[NewOnboarding] Onboarding completed successfully');
      toast.success('Onboarding completed successfully!');
      navigate('/dashboard');
    } catch (error) {
      logger.error('[NewOnboarding] Error completing onboarding:', error);
      toast.error('Failed to complete onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Animation variants
  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  const stepVariants = {
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
    <motion.div
      className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex flex-col"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
    >
      {/* Header */}
      <header className="py-6 px-8 flex justify-center">
        <img src={DFLogo} alt="DailyFix Logo" className="h-10" />
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl p-8">
          {/* Progress indicator */}
          <div className="flex justify-center w-full mb-8">
            {steps.map((_, index) => (
              <div key={index} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2
                    ${index <= activeStep
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : 'border-gray-300 bg-white text-gray-400'
                    }`}
                >
                  {index < activeStep ? (
                    <FiCheck className="text-white" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-16 h-1 ${
                      index < activeStep ? 'bg-purple-600' : 'bg-gray-300'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="w-full relative overflow-hidden min-h-[400px]">
            <AnimatePresence initial={false} custom={activeStep}>
              <motion.div
                key={activeStep}
                custom={activeStep}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute w-full h-full flex flex-col items-center justify-center p-4"
              >
                <div className="flex flex-col items-center text-center max-w-xl p-2">
                  {/* <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    {steps[activeStep].icon}
                  </div> */}
                  <h2 className="text-2xl font-bold mb-2">{steps[activeStep].title}</h2>
                  <p className="text-gray-600 text-lg mb-4">{steps[activeStep].description}</p>

                  {/* Illustration with GIF */}
                  <div className="w-full max-w-md h-48 bg-gray-100 rounded-lg flex items-center justify-center mb-8 overflow-hidden">
                    <img
                      src={steps[activeStep].image}
                      alt={steps[activeStep].title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between w-full mt-8">
            <button
              onClick={handlePrevious}
              disabled={activeStep === 0}
              className={`px-6 py-3 bg-black/75 rounded-lg w-auto transition-colors ${
                activeStep === 0
                  ? 'bg-black/75 text-gray-200 cursor-not-allowed'
                  : 'bg-white border border-purple-600 text-purple-600 hover:bg-purple-50'
              }`}
            >
              Previous
            </button>

            <button
              onClick={handleNext}
              disabled={loading}
              className={`px-6 py-3 w-auto rounded-lg flex items-center ${
                loading
                  ? 'bg-purple-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700'
              } text-white`}
            >
              {activeStep === steps.length - 1 ? (
                loading ? 'Completing...' : 'Get Started'
              ) : (
                <>
                  Next
                  <FiArrowRight className="ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-gray-500">
        <p>© {new Date().getFullYear()} DailyFix. All rights reserved.</p>
      </footer>
    </motion.div>
  );
};

export default NewOnboarding;
