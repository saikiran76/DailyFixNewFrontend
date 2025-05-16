import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  setCurrentStep,
  setIsComplete,
  ONBOARDING_STEPS
} from '../store/slices/onboardingSlice';
import logger from '../utils/logger';
import { toast } from 'react-toastify';
import DFLogo from '../images/DF.png';
import { FiArrowRight, FiCheck, FiLock, FiShield } from 'react-icons/fi';
import { FaRocket, FaRobot, FaChartBar, FaUserShield } from 'react-icons/fa';
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

  // State for terms and conditions checkboxes
  const [termsAccepted, setTermsAccepted] = useState({
    security: false,
    privacy: false
  });

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
    },
    {
      title: "Your Privacy & Security",
      description: "Please review and accept our terms regarding your data security and privacy.",
      icon: <FaUserShield className="text-4xl text-purple-500" />,
      isTerms: true
    }
  ];

  // Handle next step
  const handleNext = () => {
    // If we're on the terms step, check if both terms are accepted
    if (activeStep === steps.length - 2 && steps[activeStep + 1].isTerms) {
      setActiveStep(activeStep + 1);
    } else if (activeStep === steps.length - 1 && steps[activeStep].isTerms) {
      // Check if both terms are accepted before completing
      if (termsAccepted.security && termsAccepted.privacy) {
        handleComplete();
      } else {
        toast.error('Please accept both terms to continue');
      }
    } else if (activeStep < steps.length - 1) {
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
            {steps.filter(step => !step.isTerms).map((_, index) => (
              <div key={index} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300
                    ${index <= (activeStep < steps.length - 1 ? activeStep : activeStep - 1)
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : 'border-gray-300 bg-white text-gray-400'
                    }`}
                >
                  {index < (activeStep < steps.length - 1 ? activeStep : activeStep - 1) ? (
                    <FiCheck className="text-white" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < steps.filter(step => !step.isTerms).length - 1 && (
                  <div
                    className={`w-16 h-1 transition-all duration-300 ${
                      index < (activeStep < steps.length - 1 ? activeStep : activeStep - 1) ? 'bg-purple-600' : 'bg-gray-300'
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
                className="absolute w-full h-full flex flex-col items-center justify-center p-2"
              >
                <div className="flex flex-col items-center text-center max-w-xl p-2">
                  {/* <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    {steps[activeStep].icon}
                  </div> */}
                  <h2 className="text-2xl font-bold mb-2">{steps[activeStep].title}</h2>
                  <p className="text-gray-600 text-sm mb-2">{steps[activeStep].description}</p>

                  {/* Illustration with GIF or Terms & Conditions */}
                  {steps[activeStep].isTerms ? (
                    <div className="w-full h-[20rem] max-w-md bg-gradient-to-b from-white to-gray-50 rounded-lg p-6 py-8 mb-8 my-9 border border-gray-200 shadow-sm transition-all duration-300">
                      <div className="space-y-6">
                        <div className="flex items-start space-x-3 p-4 bg-white rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer" onClick={() => setTermsAccepted({...termsAccepted, security: !termsAccepted.security})}>
                          <div className="flex-shrink-0 mt-0.5">
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${termsAccepted.security ? 'bg-purple-600' : 'border-2 border-gray-300'}`}>
                              {termsAccepted.security && <FiCheck className="text-white text-sm" />}
                            </div>
                          </div>
                          <div className="text-left">
                            <label htmlFor="security-term" className="font-medium text-gray-800 flex items-center cursor-pointer">
                              <FiLock className="mr-2 text-purple-600" /> Secure Messaging
                            </label>
                            <p className="text-gray-600 text-sm mt-1 leading-relaxed">
                              I understand that my connected accounts are secure with DailyFix, and all messages are end-to-end encrypted.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3 p-4 bg-white rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer" onClick={() => setTermsAccepted({...termsAccepted, privacy: !termsAccepted.privacy})}>
                          <div className="flex-shrink-0 mt-0.5">
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${termsAccepted.privacy ? 'bg-purple-600' : 'border-2 border-gray-300'}`}>
                              {termsAccepted.privacy && <FiCheck className="text-white text-sm" />}
                            </div>
                          </div>
                          <div className="text-left">
                            <label htmlFor="privacy-term" className="font-medium text-gray-800 flex items-center cursor-pointer">
                              <FiShield className="mr-2 text-purple-600" /> AI Privacy
                            </label>
                            <p className="text-gray-600 text-sm mt-1 leading-relaxed">
                              I understand that DailyFix AI that interacts with my conversations is completely secure, abides by the rules of privacy, and doesn't leak any kind of data.
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 p-4 bg-purple-50 rounded-md border border-purple-100 shadow-inner">
                          <p className="text-sm text-purple-700 leading-relaxed">
                            At DailyFix, we prioritize your privacy and security above all else. Your data remains yours, and our AI systems are designed with privacy-first principles.
                          </p>
                        </div>

                        <div className="flex justify-center">
                          {termsAccepted.security && termsAccepted.privacy ? (
                            <div className="text-green-600 text-sm font-medium flex items-center">
                              <FiCheck className="mr-1" /> Ready to continue
                            </div>
                          ) : (
                            <div className="text-gray-500 text-sm font-medium">
                              Please accept both terms to continue
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-[20rem] max-w-md bg-gray-100 rounded-lg flex items-center justify-center mb-8 overflow-hidden">
                      <img
                        src={steps[activeStep].image}
                        alt={steps[activeStep].title}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
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
              disabled={loading || (steps[activeStep].isTerms && (!termsAccepted.security || !termsAccepted.privacy))}
              className={`px-6 py-3 w-auto rounded-lg flex items-center ${
                loading || (steps[activeStep].isTerms && (!termsAccepted.security || !termsAccepted.privacy))
                  ? 'bg-purple-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700'
              } text-white`}
            >
              {activeStep === steps.length - 1 ? (
                loading ? 'Completing...' : (steps[activeStep].isTerms ? 'I Accept & Continue' : 'Get Started')
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
