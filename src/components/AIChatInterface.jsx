import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiX, FiLoader, FiMessageSquare, FiClock, FiSearch, FiUser, FiCpu } from 'react-icons/fi';
import DFLogo from '../images/DF.png';
import '../styles/aiAssistant.css';
import logger from '../utils/logger';

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
  client, // Used by parent component for Matrix operations
  selectedContact,
  recentQueries = []
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('ask'); // 'ask' or 'recent'
  const [chatHistory, setChatHistory] = useState([]);
  const [currentResponse, setCurrentResponse] = useState(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

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

  // Auto-scroll to bottom when chat history updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, currentResponse]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (query.trim() && !isProcessing) {
      const userQuery = query.trim();

      // Add user message to chat history
      setChatHistory(prev => [...prev, { type: 'user', content: userQuery, timestamp: Date.now() }]);

      // Clear the input
      setQuery('');

      // Set loading state for the response
      setCurrentResponse({ type: 'loading', timestamp: Date.now() });

      try {
        // Process the query but don't send to room
        const result = await onSubmit(userQuery, false);

        // Update chat history with AI response
        if (result) {
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: result.response,
            sources: result.sources || [],
            timestamp: Date.now(),
            suggested_actions: result.suggested_actions || []
          }]);
        }
      } catch (error) {
        // Handle error
        logger.error('[AIChatInterface] Error processing query:', error);
        setChatHistory(prev => [...prev, {
          type: 'error',
          content: 'Sorry, I encountered an error processing your request.',
          timestamp: Date.now()
        }]);
      } finally {
        // Clear loading state
        setCurrentResponse(null);
      }
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
          <div className="p-6 flex flex-col h-full">
            {/* Chat history section */}
            {chatHistory.length > 0 ? (
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto mb-4 space-y-4 max-h-[300px] pr-2 custom-scrollbar"
              >
                {chatHistory.map((message, index) => (
                  <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.type === 'user' ? (
                      <div className="bg-[#0088CC]/20 text-white rounded-lg rounded-tr-none px-4 py-3 max-w-[80%] shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400 flex items-center">
                            <FiUser className="mr-1" size={10} /> You
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-sm">{message.content}</div>
                      </div>
                    ) : message.type === 'assistant' ? (
                      <div className="bg-neutral-800/80 text-white rounded-lg rounded-tl-none px-4 py-3 max-w-[80%] shadow-sm border-l-2 border-[#0088CC]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#0088CC] flex items-center">
                            <img src={DFLogo} alt="DailyFix Logo" className="w-3 h-3 mr-1" /> DailyUniAI
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{message.content}</div>

                        {/* Sources section */}
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-neutral-700">
                            <div className="flex justify-between items-center cursor-pointer text-xs text-gray-400 mb-1"
                                 onClick={() => {
                                   const sourcesList = document.getElementById(`sources-${index}`);
                                   if (sourcesList) {
                                     sourcesList.style.display = sourcesList.style.display === 'none' ? 'block' : 'none';
                                   }
                                 }}>
                              <span>Sources ({message.sources.length})</span>
                              <span>👁️ Show/Hide</span>
                            </div>
                            <div id={`sources-${index}`} className="text-xs space-y-2 mt-1" style={{display: 'none'}}>
                              {message.sources.map((source, sourceIndex) => {
                                const relevancePercentage = Math.round((source.similarity || 0) * 100);
                                const relevanceClass = relevancePercentage > 80 ? 'border-green-500' :
                                                     relevancePercentage > 60 ? 'border-yellow-500' : 'border-gray-500';
                                return (
                                  <div key={sourceIndex} className={`p-2 bg-neutral-900 rounded border-l-2 ${relevanceClass}`}>
                                    <div className="flex justify-between">
                                      <span className="text-[#0088CC]">{source.sender}</span>
                                      <span className="text-gray-500">{source.formatted_time}</span>
                                    </div>
                                    <div className="mt-1 text-gray-300">{source.content}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Suggested actions */}
                        {message.suggested_actions && message.suggested_actions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-neutral-700">
                            <div className="text-xs text-gray-400 mb-1">Suggested Actions:</div>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {message.suggested_actions.map((action, actionIndex) => (
                                <button
                                  key={actionIndex}
                                  className="text-xs bg-[#0088CC]/20 hover:bg-[#0088CC]/30 text-[#0088CC] rounded px-2 py-1 transition-colors"
                                  onClick={() => setQuery(action.display_text)}
                                >
                                  {action.display_text}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Gamification elements */}
                        <div className="mt-2 pt-2 border-t border-neutral-700 flex flex-wrap gap-2">
                          <span className="text-xs bg-green-500/10 text-green-500 rounded-full px-2 py-0.5 flex items-center">
                            🏆 +10 points
                          </span>
                          <span className="text-xs bg-amber-500/10 text-amber-500 rounded-full px-2 py-0.5 flex items-center">
                            🔥 3 day streak
                          </span>
                        </div>
                      </div>
                    ) : message.type === 'error' ? (
                      <div className="bg-red-900/20 text-white rounded-lg rounded-tl-none px-4 py-3 max-w-[80%] shadow-sm border-l-2 border-red-500">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-red-400 flex items-center">
                            <img src={DFLogo} alt="DailyFix Logo" className="w-3 h-3 mr-1" /> Error
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-sm">{message.content}</div>
                      </div>
                    ) : null}
                  </div>
                ))}

                {/* Current response (loading) */}
                {currentResponse && currentResponse.type === 'loading' && (
                  <div className="flex justify-start">
                    <div className="bg-neutral-800/80 text-white rounded-lg rounded-tl-none px-4 py-3 max-w-[80%] shadow-sm border-l-2 border-[#0088CC]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#0088CC] flex items-center">
                          <img src={DFLogo} alt="DailyFix Logo" className="w-3 h-3 mr-1" /> DailyUniAI
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(currentResponse.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="ai-thinking-animation">
                          <div className="ai-thinking-dot"></div>
                          <div className="ai-thinking-dot"></div>
                          <div className="ai-thinking-dot"></div>
                        </div>
                        <div className="text-sm text-gray-400">Thinking...</div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-neutral-700">
                        <div className="text-xs text-gray-500 italic">
                          Analyzing conversation, searching for relevant information...
                        </div>
                        <div className="w-full bg-neutral-700 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div className="ai-progress-bar"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1">
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
              </div>
            )}

            {/* Input form */}
            <form onSubmit={handleSubmit} className="relative mt-auto">
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

        {/* Gamification Elements */}
        <div className="p-4 border-t border-white/10 bg-neutral-800/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-[#0088CC]/10 px-3 py-1.5 rounded-full flex items-center text-xs font-medium text-[#0088CC] border border-[#0088CC]/20">
              <span className="mr-1.5">🏆</span> 120 Points
            </div>
            <div className="bg-amber-500/10 px-3 py-1.5 rounded-full flex items-center text-xs font-medium text-amber-500 border border-amber-500/20">
              <span className="mr-1.5">🔥</span> 3 Day Streak
            </div>
          </div>
          <div className="bg-purple-500/10 px-3 py-1.5 rounded-full flex items-center text-xs font-medium text-purple-500 border border-purple-500/20">
            <span className="mr-1.5">🎯</span> Insight Master <span className="ml-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">NEW</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 bg-neutral-800/30 text-xs text-gray-400 flex items-center justify-between">
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
