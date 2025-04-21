import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiX, FiLoader, FiMessageSquare, FiClock, FiSearch } from 'react-icons/fi';
import DFLogo from '../images/DF.png';
import '../styles/aiAssistant.css';

/**
 * Enhanced AI Chat Interface Component
 *
 * A beautiful, integrated chat interface for the AI assistant that appears
 * directly in the chat view instead of using browser prompts.
 *
 * Features:
 * - Modern, clean design with smooth animations
 * - Example queries for better user guidance
 * - Keyboard shortcuts for improved usability
 * - Responsive layout for all screen sizes
 */
const AIChatInterface = ({
  isOpen,
  onClose,
  onSubmit,
  isProcessing = false,
  client,
  selectedContact,
  recentQueries = []
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('ask'); // 'ask' or 'recent'
  const inputRef = useRef(null);

  // Focus the input when the interface opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, activeTab]);

  // Example queries based on the selected contact
  const getExampleQueries = () => {
    const defaultQueries = [
      "When is our next meeting?",
      "What was the project deadline?",
      "Summarize this conversation",
      "What did we discuss about the design?"
    ];

    // If we have a selected contact, add some personalized examples
    if (selectedContact && selectedContact.name) {
      return [
        `What did ${selectedContact.name} say about the project?`,
        ...defaultQueries
      ];
    }

    return defaultQueries;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isProcessing) {
      onSubmit(query.trim());
      setQuery(''); // Clear the input after submission
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4 animate-fadeIn">
      <div className="bg-neutral-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-[#0088CC]/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0088CC]/30 to-neutral-800 p-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-[#0088CC]/20 flex items-center justify-center mr-3">
              <img src={DFLogo} alt="DailyFix Logo" className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-medium text-white">DailyUniAI</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 w-auto hover:text-white transition-colors p-1 rounded-full hover:bg-neutral-800/50"
            disabled={isProcessing}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center ${activeTab === 'ask' ? 'text-[#0088CC] border-b-2 border-[#0088CC]' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('ask')}
          >
            <FiMessageSquare className="mr-2" /> Ask a Question
          </button>
          <button
            className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center ${activeTab === 'recent' ? 'text-[#0088CC] border-b-2 border-[#0088CC]' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('recent')}
          >
            <FiClock className="mr-2" /> Recent Queries
          </button>
        </div>

        {/* Ask a Question Tab */}
        {activeTab === 'ask' && (
          <div className="p-6">
            <div className="mb-4">
              <h4 className="text-lg font-medium text-white mb-2">Ask about your conversation</h4>
              <p className="text-gray-300 text-sm">
                I can help you find information in your chat history or answer questions about this conversation.
              </p>
            </div>

            {/* Examples */}
            <div className="mb-6 space-y-2">
              <p className="text-xs text-gray-400 mb-1">Examples:</p>
              <div className="grid grid-cols-1 gap-2">
                {getExampleQueries().map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setQuery(example)}
                    className="text-sm text-left px-3 py-2 bg-neutral-800 hover:bg-[#0088CC]/20 rounded-lg text-gray-300 hover:text-white transition-colors flex items-center"
                  >
                    <FiSearch className="mr-2 text-[#0088CC] opacity-70" size={14} />
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {/* Input form */}
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What would you like to know about this conversation?"
                className="w-full bg-neutral-800 text-white rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-[#0088CC] resize-none min-h-[80px] max-h-[120px]"
                disabled={isProcessing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!query.trim() || isProcessing}
                className={`absolute right-3 bottom-3 p-2 rounded-full w-auto transition-all ${
                  query.trim() && !isProcessing
                    ? 'bg-[#0088CC] text-white hover:bg-[#0077BB]'
                    : 'bg-neutral-700 text-gray-400'
                }`}
              >
                {isProcessing ? (
                  <FiLoader className="w-5 h-5 animate-spin" />
                ) : (
                  <FiSend className="w-4 h-5" />
                )}
              </button>
            </form>
          </div>
        )}

        {/* Recent Queries Tab */}
        {activeTab === 'recent' && (
          <div className="p-6">
            <div className="mb-4">
              <h4 className="text-lg font-medium text-white mb-2">Recent Queries</h4>
              <p className="text-gray-300 text-sm">
                View your recent questions and their answers.
              </p>
            </div>

            {recentQueries.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {recentQueries.map((item, index) => (
                  <div key={index} className="bg-neutral-800/50 rounded-lg p-3 hover:bg-neutral-800 transition-colors cursor-pointer"
                    onClick={() => setQuery(item.query)}
                  >
                    <div className="text-sm text-[#0088CC] mb-1 flex items-center">
                      <FiSearch className="mr-2" size={12} />
                      {item.query}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-4">
                  <FiClock className="text-gray-400 text-2xl" />
                </div>
                <p className="text-gray-400">No recent queries yet</p>
                <button
                  onClick={() => setActiveTab('ask')}
                  className="mt-4 px-4 py-2 bg-[#0088CC] text-white rounded-md hover:bg-[#0077BB] transition-colors"
                >
                  Ask a question
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-neutral-800/30 text-xs text-gray-400 flex items-center justify-between">
          <div>
            Powered by DailyUniAI
          </div>
          <div>
            {selectedContact && (
              <span>Analyzing chat with {selectedContact.name}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIChatInterface;
