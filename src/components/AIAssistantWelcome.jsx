import React, { useState } from 'react';
import { FiX, FiCheck, FiSearch, FiMessageSquare, FiLock } from 'react-icons/fi';
import '../styles/aiAssistant.css';
import DFLogo from '../images/DF.png'

/**
 * AI Assistant Welcome Modal
 *
 * A beautiful, informative modal that introduces users to the AI assistant feature
 * and explains its capabilities and privacy considerations.
 */
const AIAssistantWelcome = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "Meet DailyUniAI",
      description: "Your personal AI assistant helps you find information in your conversations and answer questions about your chat history.",
      icon: <img src={DFLogo} alt="DailyFix Logo" className="w-12 h-12" />,
      color: "blue"
    },
    {
      title: "Conversation Intelligence",
      description: "Ask questions about past conversations and get accurate answers based on your chat history.",
      icon: <FiSearch className="w-12 h-12 text-blue-500" />,
      color: "blue"
    },
    {
      title: "Natural Interaction",
      description: "Just ask a question in natural language, and the AI will analyze your conversations to find the answer.",
      icon: <FiMessageSquare className="w-12 h-12 text-green-500" />,
      color: "green"
    },
    {
      title: "Privacy First",
      description: "Your data is processed securely. The AI only has access to conversations you've already had.",
      icon: <FiLock className="w-12 h-12 text-red-500" />,
      color: "red"
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Save to localStorage that the user has seen the welcome
      localStorage.setItem('ai_assistant_welcomed', 'true');
      onClose();
    }
  };

  const handleSkip = () => {
    // Save to localStorage that the user has seen the welcome
    localStorage.setItem('ai_assistant_welcomed', 'true');
    onClose();
  };

  const currentStepData = steps[currentStep];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-white/10 animate-fadeIn">
        {/* Header with close button */}
        <div className="flex justify-between items-center p-4 border-b border-white/10">
          <h3 className="text-xl font-medium text-white flex items-center">
            <img src={DFLogo} alt="DailyFix Logo" className="w-6 h-6 mr-2" />
            DailyUniAI
          </h3>
          <button
            onClick={handleSkip}
            className="text-gray-400 w-auto hover:text-white transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex flex-col items-center text-center mb-6">
            <div className={`w-24 h-24 rounded-full bg-${currentStepData.color}-500/20 flex items-center justify-center mb-4`}>
              {currentStepData.icon}
            </div>
            <h4 className="text-xl font-medium text-white mb-2">{currentStepData.title}</h4>
            <p className="text-gray-300">{currentStepData.description}</p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center space-x-2 mb-6">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full ${
                  index === currentStep
                    ? 'bg-[#0088CC]'
                    : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer with buttons */}
        <div className="p-4 border-t border-white/10 flex justify-between">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            className="px-6 py-2 bg-[#0088CC] hover:bg-[#0077BB] text-white rounded-md flex items-center transition-colors"
          >
            {currentStep === steps.length - 1 ? (
              <>
                Get Started <FiCheck className="ml-2" />
              </>
            ) : (
              'Next'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantWelcome;
