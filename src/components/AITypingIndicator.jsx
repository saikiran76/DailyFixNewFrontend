import React from 'react';
import DFLogo from '../images/DF.png';
import '../styles/aiAssistant.css';

/**
 * AI Typing Indicator Component
 *
 * A component that shows a typing indicator when the AI is generating a response.
 * This creates a more engaging and human-like experience.
 */
const AITypingIndicator = () => {
  return (
    <div className="flex items-start space-x-2 p-3 bg-neutral-800/30 rounded-lg border border-[#0088CC]/20 max-w-xs animate-fadeIn">
      <div className="w-8 h-8 rounded-full bg-[#0088CC]/20 flex items-center justify-center">
        <img src={DFLogo} alt="DailyFix Logo" className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <div className="text-xs text-gray-400 mb-1">DailyUniAI is thinking...</div>
        <div className="flex space-x-1">
          <div className="w-2 h-2 rounded-full bg-[#0088CC] animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-[#0088CC] animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-[#0088CC] animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
};

export default AITypingIndicator;
