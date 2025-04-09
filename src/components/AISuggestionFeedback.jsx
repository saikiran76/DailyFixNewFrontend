import React, { useState, useEffect, useRef } from 'react';
import { FiCheck } from 'react-icons/fi';
import '../styles/CardStyles.css'

/**
 * AI Suggestion Feedback Popup Component
 * This appears in the bottom right corner when a user views analytics
 * Allows users to provide feedback on whether AI suggestions were helpful
 */
const AISuggestionFeedback = ({ isOpen, onClose }) => {
  const popupRef = useRef(null);

  useEffect(() => {
    // Handle clicking outside to close
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={popupRef}
      className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg p-4 w-64 z-50 animate-fadeIn"
    >
      <div className="glow"></div>
      <p className="text-sm font-medium text-neutral-800 mb-2">Is AI suggestion accurate?</p>
      <p className="text-xs text-neutral-600 mb-3">Did this help you prioritize your conversations? Help us improve.</p>
      <div className="flex space-x-2">
        <button 
          onClick={() => {
            onClose();
            // In a real app, you would send this feedback to your API
          }}
          className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 text-white py-1 px-3 rounded text-xs"
        >
          <FiCheck size={12} />
          <span>Yes, indeed!</span>
        </button>
        <button 
          onClick={() => {
            onClose();
            // In a real app, you would send this feedback to your API
          }}
          className="flex-1 flex items-center justify-center gap-1 bg-red-400 text-white py-1 px-3 rounded text-xs"
        >
          <span>Nope</span>
        </button>
      </div>
    </div>
  );
};

export default AISuggestionFeedback; 