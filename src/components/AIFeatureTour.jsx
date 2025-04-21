import React, { useState, useEffect } from 'react';
import { FiX, FiArrowRight, FiArrowLeft, FiCheck, FiArrowDown } from 'react-icons/fi';
import DFLogo from '../images/DF.png';
import '../styles/aiAssistant.css';

/**
 * AI Feature Tour Component
 *
 * A guided tour that highlights the AI assistant features and shows users how to use them.
 * This creates an engaging onboarding experience that draws attention to the feature.
 */
const AIFeatureTour = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState(null);

  const steps = [
    {
      title: "Meet DailyUniAI",
      description: "Your personal AI assistant helps you find information in your conversations. Let's take a quick tour!",
      target: null, // No specific target for intro
      position: "center"
    },
    {
      title: "Access the AI Assistant",
      description: "Click the AI button in the message composer to ask questions about your conversation.",
      target: ".ai-assistant-button-composer", // CSS selector for the button in composer
      position: "top"
    },
    {
      title: "Alternative Access",
      description: "You can also use the AI button in the header, or press Alt+A on your keyboard anytime.",
      target: ".ai-assistant-button:not(.ai-assistant-button-composer)", // CSS selector for the header button
      position: "bottom"
    },
    {
      title: "Ask Questions",
      description: "Ask questions like 'What was the project deadline?' or 'When is our next meeting?' to get quick answers.",
      target: null, // No specific target for this general info
      position: "center"
    },
    {
      title: "View Sources",
      description: "The AI will show you where it found the information, so you can verify the answers.",
      target: null, // We'll show a mock response
      position: "center",
      showMockResponse: true
    },
    {
      title: "You're All Set!",
      description: "Now you can use the AI assistant to help you find information in your conversations quickly and easily.",
      target: null,
      position: "center"
    }
  ];

  // Find and highlight the target element
  useEffect(() => {
    const step = steps[currentStep];
    if (step.target) {
      const element = document.querySelector(step.target);
      if (element) {
        setHighlightedElement(element);
        // Add a temporary highlight class
        element.classList.add('ai-tour-highlight');
      }
    } else {
      setHighlightedElement(null);
    }

    // Cleanup function
    return () => {
      if (highlightedElement) {
        highlightedElement.classList.remove('ai-tour-highlight');
      }
    };
  }, [currentStep, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Save to localStorage that the user has completed the tour
      localStorage.setItem('ai_assistant_tour_completed', 'true');
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    // Save to localStorage that the user has completed the tour
    localStorage.setItem('ai_assistant_tour_completed', 'true');
    onClose();
  };

  const currentStepData = steps[currentStep];

  // Render a mock AI response for the sources step
  const renderMockResponse = () => {
    if (!currentStepData.showMockResponse) return null;

    return (
      <div className="bg-neutral-800/50 rounded-lg border border-[#0088CC]/20 shadow-lg overflow-hidden transition-all duration-300 mt-4 max-w-md mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0088CC]/30 to-neutral-800 p-3 flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-[#0088CC]/20 flex items-center justify-center mr-3">
              <img src={DFLogo} alt="DailyFix Logo" className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-white font-medium text-sm">DailyUniAI</h4>
              <p className="text-xs text-gray-400">Just now</p>
            </div>
          </div>

          <button className="text-gray-400 hover:text-white transition-colors">
            <FiArrowDown className="w-4 h-4" />
          </button>
        </div>

        {/* Response */}
        <div className="px-4 py-3">
          <div className="text-white text-sm leading-relaxed">
            The project deadline is Friday, May 15th at 5:00 PM.
          </div>
        </div>

        {/* Sources */}
        <div className="bg-neutral-900/50 border-t border-neutral-700/50 p-3">
          <h5 className="text-xs uppercase text-gray-400 mb-2 font-medium">Sources</h5>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
            <div className="text-xs bg-neutral-800/70 p-2 rounded border border-neutral-700/50">
              <div className="flex justify-between mb-1">
                <span className="text-[#0088CC] font-medium">John Doe</span>
                <span className="text-gray-500">Yesterday, 2:30 PM</span>
              </div>
              <p className="text-gray-300">Don't forget our project deadline is this Friday at 5 PM!</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-white/10 animate-fadeIn">
        {/* Header with close button */}
        <div className="flex justify-between items-center p-4 border-b border-white/10">
          <h3 className="text-xl font-medium text-white flex items-center">
            <img src={DFLogo} alt="DailyFix Logo" className="w-6 h-6 mr-2" />
            DailyUniAI Tour
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
            <h4 className="text-xl font-medium text-white mb-2">{currentStepData.title}</h4>
            <p className="text-gray-300 mb-4">{currentStepData.description}</p>

            {renderMockResponse()}
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
          {currentStep > 0 ? (
            <button
              onClick={handlePrevious}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors flex items-center"
            >
              <FiArrowLeft className="mr-1" /> Back
            </button>
          ) : (
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Skip
            </button>
          )}

          <button
            onClick={handleNext}
            className="px-6 py-2 bg-[#0088CC] hover:bg-[#0077BB] text-white rounded-md flex items-center transition-colors"
          >
            {currentStep === steps.length - 1 ? (
              <>
                Get Started <FiCheck className="ml-2" />
              </>
            ) : (
              <>
                Next <FiArrowRight className="ml-2" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIFeatureTour;
