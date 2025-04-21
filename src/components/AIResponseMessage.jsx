import React, { useState } from 'react';
import { FiChevronDown, FiChevronUp, FiInfo, FiExternalLink } from 'react-icons/fi';
import DFLogo from '../images/DF.png';
import '../styles/aiAssistant.css';

/**
 * Enhanced AI Response Message Component
 *
 * A beautifully styled component for displaying AI assistant responses
 * with expandable source information and metadata.
 *
 * Features:
 * - Clean, modern design matching the tour UI
 * - Always visible sources section with expandable details
 * - Proper formatting and styling for better readability
 * - Animated transitions for a polished experience
 */
const AIResponseMessage = ({ response, sources = [], query, timestamp }) => {
  const [expanded, setExpanded] = useState(true); // Default to expanded view
  const [showSourcesView, setShowSourcesView] = useState(false);

  // Format the timestamp
  const formattedTime = new Date(timestamp).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Handle view sources click
  const handleViewSources = () => {
    setShowSourcesView(true);
  };

  // Handle close sources view
  const handleCloseSourcesView = () => {
    setShowSourcesView(false);
  };

  // Render the sources view overlay
  const renderSourcesView = () => {
    if (!showSourcesView) return null;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4 animate-fadeIn">
        <div className="bg-neutral-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-[#0088CC]/20">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0088CC]/30 to-neutral-800 p-4 flex items-center justify-between border-b border-white/10">
            <h3 className="text-xl font-medium text-white flex items-center">
              View Sources
            </h3>
            <button
              onClick={handleCloseSourcesView}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-neutral-800/50"
            >
              <FiChevronDown className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-gray-300 mb-6 text-center">
              The AI will show you where it found the information, so you can verify the answers.
            </p>

            {/* AI Response */}
            <div className="bg-neutral-800/50 rounded-lg border border-[#0088CC]/20 shadow-lg overflow-hidden transition-all duration-300 mb-6">
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
              </div>

              <div className="px-4 py-3">
                <div className="text-white text-sm leading-relaxed whitespace-pre-wrap">
                  {response}
                </div>
              </div>
            </div>

            {/* Sources */}
            <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg overflow-hidden">
              <div className="p-3 border-b border-neutral-700/50">
                <h5 className="text-xs uppercase text-gray-400 font-medium">Sources</h5>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {sources.map((source, index) => {
                  // Format the source timestamp
                  const sourceTime = new Date(source.timestamp).toLocaleString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    month: 'short',
                    day: 'numeric'
                  });

                  return (
                    <div key={index} className="p-3 border-b border-neutral-700/20 hover:bg-neutral-800/30 transition-colors">
                      <div className="flex justify-between mb-1">
                        <span className="text-[#0088CC] font-medium">{source.sender}</span>
                        <span className="text-gray-500">{sourceTime}</span>
                      </div>
                      <p className="text-gray-300 text-sm">{source.content}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-neutral-800/50 rounded-lg border border-[#0088CC]/20 shadow-lg overflow-hidden transition-all duration-300 hover:shadow-[#0088CC]/10">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0088CC]/30 to-neutral-800 p-3 flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-[#0088CC]/20 flex items-center justify-center mr-3">
              <img src={DFLogo} alt="DailyFix Logo" className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-white font-medium text-sm">DailyUniAI</h4>
              <p className="text-xs text-gray-400">{formattedTime}</p>
            </div>
          </div>

          {sources.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-neutral-700/50"
              title={expanded ? "Hide sources" : "Show sources"}
            >
              {expanded ? <FiChevronUp /> : <FiChevronDown />}
            </button>
          )}
        </div>

        {/* Response */}
        <div className="px-4 py-3">
          <div className="text-white text-sm leading-relaxed whitespace-pre-wrap">
            {response}
          </div>
        </div>

        {/* Sources (expandable) */}
        {sources.length > 0 && expanded && (
          <div className="bg-neutral-900/50 border-t border-neutral-700/50 p-3 animate-fadeIn">
            <div className="flex justify-between items-center mb-2">
              <h5 className="text-xs uppercase text-gray-400 font-medium">Sources</h5>
              <button
                onClick={handleViewSources}
                className="text-xs text-[#0088CC] hover:text-[#0077BB] flex items-center transition-colors"
              >
                View Sources <FiExternalLink className="ml-1 w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
              {sources.slice(0, 1).map((source, index) => (
                <div key={index} className="text-xs bg-neutral-800/70 p-2 rounded border border-neutral-700/50">
                  <div className="flex justify-between mb-1">
                    <span className="text-[#0088CC] font-medium">{source.sender}</span>
                    <span className="text-gray-500">
                      {new Date(source.timestamp).toLocaleString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <p className="text-gray-300">{source.content}</p>
                </div>
              ))}
              {sources.length > 1 && (
                <button
                  onClick={handleViewSources}
                  className="w-full text-center text-xs text-[#0088CC] hover:text-[#0077BB] py-1 hover:bg-neutral-800/50 rounded transition-colors"
                >
                  View {sources.length - 1} more {sources.length - 1 === 1 ? 'source' : 'sources'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sources View Overlay */}
      {renderSourcesView()}
    </>
  );
};

export default AIResponseMessage;
