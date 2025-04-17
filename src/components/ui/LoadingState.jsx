import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * Enhanced loading component with engaging animations and messages
 * Provides a more delightful user experience during loading states
 */
const LoadingState = ({
  platform = 'telegram',
  message = null,
  timeout = 10000, // 10 seconds default timeout
  onTimeout = null,
  variant = 'default' // 'default', 'minimal', 'fullscreen'
}) => {
  const [currentMessage, setCurrentMessage] = useState(0);
  const [showTimeout, setShowTimeout] = useState(false);
  // Create the ref inside the component body
  const hasCalledTimeout = React.useRef(false);

  // Platform-specific colors and messages
  const platformConfig = {
    telegram: {
      color: '#0088cc',
      icon: '📱',
      messages: [
        "Connecting to Telegram...",
        "Syncing your conversations...",
        "Almost there! Loading your chats...",
        "Fetching your recent messages...",
        "Just a moment while we connect the dots..."
      ]
    },
    whatsapp: {
      color: '#25D366',
      icon: '💬',
      messages: [
        "Connecting to WhatsApp...",
        "Syncing your conversations...",
        "Almost there! Loading your chats...",
        "Fetching your recent messages...",
        "Just a moment while we connect the dots..."
      ]
    },
    matrix: {
      color: '#0DBD8B',
      icon: '🔄',
      messages: [
        "Initializing Matrix connection...",
        "Syncing your rooms...",
        "Preparing your secure environment...",
        "Establishing encrypted channels...",
        "Almost ready to connect you..."
      ]
    }
  };

  const config = platformConfig[platform] || platformConfig.telegram;
  const messages = message ? [message] : config.messages;

  // Cycle through messages for longer loading times
  useEffect(() => {
    if (messages.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % messages.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [messages]);

  // Show timeout message after specified time
  useEffect(() => {
    // Only set a timeout if onTimeout is provided
    if (!onTimeout) {
      return;
    }

    // Reset the ref when the component mounts or when onTimeout changes
    hasCalledTimeout.current = false;

    const timer = setTimeout(() => {
      if (!hasCalledTimeout.current) {
        setShowTimeout(true);
        // Only call onTimeout if it exists and we haven't called it yet
        hasCalledTimeout.current = true;
        onTimeout();
      }
    }, timeout);

    return () => {
      clearTimeout(timer);
    };
  }, [timeout, onTimeout]);

  if (variant === 'minimal') {
    return (
      <div className="flex items-center space-x-2 p-2">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-4 h-4 border-2 border-t-transparent rounded-full"
          style={{ borderColor: `${config.color}`, borderTopColor: 'transparent' }}
        />
        <span className="text-sm text-gray-400">{messages[currentMessage]}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${variant === 'fullscreen' ? 'h-screen' : 'h-full'} bg-gray-900 text-white`}>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-6 max-w-md">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <span className="text-5xl mb-4 inline-block">{config.icon}</span>
            <motion.div
              animate={{
                y: [0, -10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatType: "reverse"
              }}
              className="w-16 h-16 mx-auto relative"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-t-transparent rounded-full absolute"
                style={{ borderColor: `${config.color}`, borderTopColor: 'transparent' }}
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 border-4 border-t-transparent rounded-full absolute top-3 left-3"
                style={{ borderColor: `${config.color}40`, borderTopColor: 'transparent' }}
              />
            </motion.div>
          </motion.div>

          <motion.div
            key={currentMessage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="mb-4"
          >
            <h3 className="text-xl font-medium text-white mb-2">
              {messages[currentMessage]}
            </h3>
            <p className="text-gray-400 text-sm">
              We're setting up your secure connection
            </p>
          </motion.div>

          {showTimeout && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 p-4 bg-gray-800 rounded-lg"
            >
              <p className="text-yellow-400 text-sm mb-2">
                This is taking longer than expected
              </p>
              <p className="text-gray-400 text-xs">
                We're still trying to connect. You can continue waiting or try again later.
              </p>
              <button
                className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm text-white transition-colors"
                onClick={() => window.location.reload()}
              >
                Refresh
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoadingState;
