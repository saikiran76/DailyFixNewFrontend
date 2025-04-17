import React, { useState, useEffect } from 'react';
import { FiMessageCircle, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { FaTelegram } from 'react-icons/fa';

/**
 * ChatConfirmation component
 * Shows a confirmation UI before displaying chat content
 *
 * @param {Object} props
 * @param {Object} props.contact - The contact object
 * @param {Function} props.onConfirm - Callback when user confirms
 * @param {boolean} props.isJoining - Whether the room is currently being joined
 * @param {string} props.error - Error message if joining failed
 */
const ChatConfirmation = ({ contact, onConfirm, isJoining = false, error = null }) => {
  const [isAnimating, setIsAnimating] = useState(true);

  // Animation effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-neutral-900 to-neutral-950 text-white">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center p-8 max-w-md bg-neutral-800/30 rounded-xl border border-white/5 shadow-lg">
          {isJoining ? (
            <>
              <div className="relative mx-auto mb-8 w-24 h-24">
                <div className="absolute inset-0 rounded-full bg-[#0088cc] opacity-20 animate-ping"></div>
                <div className="absolute inset-0 rounded-full border-4 border-[#0088cc] border-r-transparent animate-spin"></div>
                <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-neutral-800 shadow-lg">
                  <FaTelegram className="text-[#0088cc] text-4xl animate-pulse" />
                </div>
              </div>
              <h3 className="text-xl font-medium text-white mb-3">Joining Telegram Chat</h3>
              <p className="text-gray-400 mb-6">
                We're connecting you to this conversation. This will only take a moment...
              </p>
              <div className="w-full bg-neutral-700/30 h-1.5 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-[#0088cc] rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
              <div className="flex justify-center space-x-2 text-xs text-gray-500">
                <span className="px-2 py-1 bg-neutral-800 rounded-full">End-to-End Encrypted</span>
                <span className="px-2 py-1 bg-neutral-800 rounded-full">Telegram</span>
              </div>
            </>
          ) : error ? (
            <>
              <div className="mx-auto mb-8 w-24 h-24 flex items-center justify-center rounded-full bg-red-500/10 border border-red-500/30 shadow-lg">
                <FiAlertCircle className="text-red-500 text-4xl" />
              </div>
              <h3 className="text-xl font-medium text-white mb-3">Unable to Join Chat</h3>
              <p className="text-red-400 mb-6 bg-red-500/5 p-3 rounded-lg border border-red-500/10 text-sm">{error}</p>
              <button
                onClick={onConfirm}
                className="px-6 py-3 bg-gradient-to-r from-[#0088cc] to-[#0077b6] text-white rounded-lg hover:shadow-lg hover:from-[#0077b6] hover:to-[#006699] transition-all duration-200 transform hover:-translate-y-0.5 shadow-md"
              >
                Try Again
              </button>
            </>
          ) : (
            <>
              <div className={`relative mx-auto mb-8 w-24 h-24 transition-all duration-500 ${
                isAnimating ? 'scale-100' : 'scale-95'
              }`}>
                {isAnimating && (
                  <div className="absolute inset-0 rounded-full bg-[#0088cc] opacity-20 animate-ping"></div>
                )}
                <div className={`relative flex items-center justify-center w-24 h-24 rounded-full transition-all duration-500 shadow-lg ${
                  isAnimating ? 'bg-neutral-800' : 'bg-gradient-to-br from-[#0088cc] to-[#0077b6]'
                }`}>
                  {isAnimating ? (
                    <FiMessageCircle className="text-[#0088cc] text-4xl animate-pulse" />
                  ) : (
                    <FiCheck className="text-white text-4xl" />
                  )}
                </div>
              </div>
              <h3 className="text-xl font-medium text-white mb-3">
                View {contact?.telegramContact?.firstName || contact?.name} Chat
              </h3>
              <p className="text-gray-400 mb-6">
                You're about to view messages from this Telegram conversation.
                This will automatically join the chat if you haven't already.
              </p>
              <div className="space-y-4">
                <button
                  onClick={onConfirm}
                  className={`w-full px-6 py-3 bg-gradient-to-r from-[#0088cc] to-[#0077b6] text-white rounded-lg hover:shadow-lg hover:from-[#0077b6] hover:to-[#006699] transition-all duration-200 transform hover:-translate-y-0.5 shadow-md flex items-center justify-center ${
                    isAnimating ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={isAnimating}
                >
                  {isAnimating ? (
                    'Preparing...'
                  ) : (
                    <>
                      <FaTelegram className="mr-2" />
                      View Messages
                    </>
                  )}
                </button>
                <div className="flex justify-center space-x-2 text-xs text-gray-500 mt-2">
                  <span className="px-2 py-1 bg-neutral-800 rounded-full">End-to-End Encrypted</span>
                  <span className="px-2 py-1 bg-neutral-800 rounded-full">Telegram</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatConfirmation;
