import React, { useState, useEffect } from 'react';
import { FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';
import AIAssistantWelcome from './AIAssistantWelcome';
import AIResponseMessage from './AIResponseMessage';
import AITypingIndicator from './AITypingIndicator';
import AIChatInterface from './AIChatInterface';
import DFLogo from '../images/DF.png';
import { ENDPOINTS, CONFIG } from '../config/aiService';
import '../styles/aiAssistant.css';

/**
 * AI Assistant Button Component
 *
 * A sleek, non-intrusive button that integrates with the Telegram chat interface
 * to provide AI assistant capabilities.
 */
const AIAssistantButton = ({ client, selectedContact, className = "" }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipTimer, setTooltipTimer] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(true); // Default to true, will check in useEffect
  const [showNewBadge, setShowNewBadge] = useState(true); // Show the "New" badge by default
  const [showInitialTooltip, setShowInitialTooltip] = useState(false); // Show initial tooltip to draw attention
  const [showChatInterface, setShowChatInterface] = useState(false); // Show the chat interface
  const [recentQueries, setRecentQueries] = useState([]); // Store recent queries

  // Check if user has seen the welcome modal and if the new badge should be shown
  useEffect(() => {
    const welcomed = localStorage.getItem('ai_assistant_welcomed');
    setHasSeenWelcome(welcomed === 'true');

    // Check if the new badge has been dismissed
    const badgeDismissed = localStorage.getItem('ai_assistant_badge_dismissed');
    setShowNewBadge(badgeDismissed !== 'true');

    // Auto-hide the new badge after 7 days
    const firstSeen = localStorage.getItem('ai_assistant_first_seen');
    if (!firstSeen) {
      localStorage.setItem('ai_assistant_first_seen', Date.now().toString());
    } else {
      const firstSeenDate = parseInt(firstSeen, 10);
      const daysSinceFirstSeen = (Date.now() - firstSeenDate) / (1000 * 60 * 60 * 24);
      if (daysSinceFirstSeen > 7) {
        setShowNewBadge(false);
        localStorage.setItem('ai_assistant_badge_dismissed', 'true');
      }
    }

    // Load recent queries from localStorage
    try {
      const savedQueries = localStorage.getItem('ai_assistant_recent_queries');
      if (savedQueries) {
        const parsedQueries = JSON.parse(savedQueries);
        setRecentQueries(parsedQueries);
      }
    } catch (error) {
      logger.error('[AIAssistant] Error loading recent queries:', error);
    }

    // Show initial tooltip after a delay to grab attention
    const initialTooltipShown = localStorage.getItem('ai_assistant_initial_tooltip_shown');
    if (initialTooltipShown !== 'true') {
      const timer = setTimeout(() => {
        setShowInitialTooltip(true);
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setShowInitialTooltip(false);
          localStorage.setItem('ai_assistant_initial_tooltip_shown', 'true');
        }, 5000);
      }, 2000); // Show 2 seconds after component mounts

      return () => clearTimeout(timer);
    }

    // Clean up tooltip timer when component unmounts
    return () => {
      if (tooltipTimer) clearTimeout(tooltipTimer);
    };
  }, [tooltipTimer]);

  /**
   * Handle asking the AI assistant
   */
  const handleAskAssistant = () => {
    if (!client || !selectedContact || isProcessing) return;

    // Dismiss the new badge when the button is clicked
    if (showNewBadge) {
      setShowNewBadge(false);
      localStorage.setItem('ai_assistant_badge_dismissed', 'true');
    }

    // Show welcome modal if user hasn't seen it yet
    if (!hasSeenWelcome) {
      setShowWelcome(true);
      return;
    }

    // Show the chat interface instead of using a browser prompt
    setShowChatInterface(true);
  };

  /**
   * Process the AI query with the given input
   */
  const processAIQuery = async (query) => {
    if (!client || !selectedContact || isProcessing || !query) return;

    let typingMsgId = null;

    try {
      logger.info('[AIAssistant] Processing query:', query);

      // Get room from Matrix client
      const roomId = selectedContact.id;
      const room = client.getRoom(roomId);

      if (!room) {
        toast.error("Couldn't access the chat room");
        return;
      }

      setIsProcessing(true);

      // Show loading toast with a more engaging message
      const toastId = toast.loading('AI assistant is analyzing your conversation...', {
        duration: 10000, // 10 seconds
        position: 'bottom-center'
      });

      // Send a typing indicator message
      typingMsgId = await client.sendMessage(roomId, {
        msgtype: 'm.room.message',
        body: 'AI Assistant is thinking...',
        format: 'org.matrix.custom.html',
        formatted_body: `<div class="ai-typing-indicator">AI Assistant is thinking...</div>`,
        'm.relates_to': {
          rel_type: 'm.replace',
          event_id: null // Will be filled in later
        }
      });

      // Get recent messages from timeline
      const timeline = room.getLiveTimeline();
      const events = timeline.getEvents();
      const messages = events
        .filter(event => event.getType() === 'm.room.message')
        .slice(-CONFIG.MAX_CONTEXT_MESSAGES)  // Last N messages based on config
        .map(event => ({
          id: event.getId(),
          sender: event.getSender(),
          content: event.getContent(),
          timestamp: event.getOriginServerTs(),
          room_id: roomId
        }));

      // Get room context
      const roomContext = {
        room_id: roomId,
        name: room.name || 'Unknown Room',
        members: room.getJoinedMembers().map(member => ({
          user_id: member.userId,
          display_name: member.name
        }))
      };

      // Get user context
      const userContext = {
        user_id: client.getUserId(),
        display_name: client.getUser(client.getUserId())?.displayName || 'User'
      };

      logger.info('[AIAssistant] Sending query to AI assistant API');

      // Send request to AI assistant API
      const response = await fetch(ENDPOINTS.QUERY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          messages,
          room_context: roomContext,
          user_context: userContext
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Update toast with success message
      toast.success('AI assistant has responded', { id: toastId });

      // Save the query to recent queries
      const newQuery = {
        query,
        response: result.response,
        sources: result.sources || [],
        timestamp: Date.now()
      };

      // Update recent queries (keep only the configured maximum)
      const updatedQueries = [newQuery, ...recentQueries].slice(0, CONFIG.MAX_RECENT_QUERIES);
      setRecentQueries(updatedQueries);

      // Save to localStorage
      try {
        localStorage.setItem('ai_assistant_recent_queries', JSON.stringify(updatedQueries));
      } catch (storageError) {
        logger.error('[AIAssistant] Error saving recent queries:', storageError);
      }

      // Create a React element with our custom component
      const responseElement = (
        <AIResponseMessage
          response={result.response}
          sources={result.sources || []}
          query={query}
          timestamp={Date.now()}
        />
      );

      // Convert the React element to HTML
      const tempDiv = document.createElement('div');
      // We'd normally use ReactDOM.render here, but in this context we'll use a simpler approach
      tempDiv.innerHTML = `
        <div class="ai-response-container">
          <div class="ai-response-header">
            <span class="ai-icon">🤖</span>
            <span class="ai-title">AI Assistant</span>
          </div>
          <div class="ai-response-content">
            ${result.response}
          </div>
        </div>
      `;

      // Send AI response to the room with HTML formatting
      // If we have a typing indicator, replace it; otherwise send a new message
      if (typingMsgId) {
        await client.sendMessage(roomId, {
          msgtype: 'm.room.message',
          body: `🤖 AI Assistant: ${result.response}`,
          format: 'org.matrix.custom.html',
          formatted_body: tempDiv.innerHTML,
          'm.relates_to': {
            rel_type: 'm.replace',
            event_id: typingMsgId
          }
        });
      } else {
        await client.sendHtmlMessage(
          roomId,
          `🤖 AI Assistant: ${result.response}`,
          tempDiv.innerHTML
        );
      }

      // Index messages in the background
      try {
        // Send batch of messages to be indexed
        fetch(ENDPOINTS.BATCH_INDEX, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages.map(msg => ({
              id: msg.id,
              sender: msg.sender,
              senderName: room.getMember(msg.sender)?.name || 'Unknown',
              content: msg.content,
              timestamp: msg.timestamp,
              roomId: msg.room_id,
              eventType: 'm.room.message',
              isFromMe: msg.sender === client.getUserId()
            })),
            room_id: roomId,
            user_id: client.getUserId()
          })
        }).catch(error => {
          logger.error('[AIAssistant] Error indexing messages:', error);
        });
      } catch (indexError) {
        logger.error('[AIAssistant] Error preparing messages for indexing:', indexError);
      }

    } catch (error) {
      logger.error('[AIAssistant] Error querying AI assistant:', error);
      toast.error('Sorry, the AI assistant encountered an error');

      // If we have a typing indicator, replace it with an error message
      if (typingMsgId) {
        try {
          await client.sendMessage(roomId, {
            msgtype: 'm.room.message',
            body: '🤖 AI Assistant: Sorry, I encountered an error processing your request.',
            format: 'org.matrix.custom.html',
            formatted_body: `
              <div class="ai-response-container ai-error">
                <div class="ai-response-header">
                  <span class="ai-icon">🤖</span>
                  <span class="ai-title">AI Assistant</span>
                </div>
                <div class="ai-response-content">
                  Sorry, I encountered an error processing your request. Please try again later.
                </div>
              </div>
            `,
            'm.relates_to': {
              rel_type: 'm.replace',
              event_id: typingMsgId
            }
          });
        } catch (sendError) {
          logger.error('[AIAssistant] Error sending error message:', sendError);
        }
      }
    } finally {
      setIsProcessing(false);
      // Don't automatically close the chat interface on error
      // This allows the user to try again without reopening
      if (!error) {
        setShowChatInterface(false); // Close the chat interface only on success
      }
    }
  };

  return (
    <div className="relative">
      <button
        disabled={isProcessing}
        onClick={(e) => {
          e.stopPropagation(); // Prevent immediate handling of click
          handleAskAssistant();
        }}
        className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center ${
          isProcessing
            ? 'text-white animate-spin'
            : showNewBadge
              ? 'text-white animate-attention'
              : className.includes('ai-assistant-button-composer')
                ? 'text-white' // Always white text for composer button
                : 'text-gray-400 hover:text-white'
        } ${className}`}
        title="Ask AI Assistant"
        aria-label="Ask AI Assistant"
        data-tooltip="Ask AI Assistant (Alt+A)"
      >
        {isProcessing ? (
          <FiLoader className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <img src={DFLogo} alt="DailyFix Logo" className="w-5 h-5" />
            {className.includes('ai-assistant-button-composer') && (
              <span className="sr-only">Ask AI Assistant</span>
            )}
          </>
        )}
      </button>

      {/* New feature badge */}
      {showNewBadge && (
        <span className="new-feature-badge">NEW</span>
      )}

      {/* Completely redesigned tooltip for maximum visibility */}
      {(showTooltip || showInitialTooltip) && !isProcessing && (
        <div className="fixed top-20 right-20 px-6 py-4 bg-[#0088CC] text-white text-base font-medium rounded-lg shadow-xl whitespace-nowrap z-[9999] border-2 border-white animate-fadeIn">
          <span className="block text-center text-lg">✨ Try DailyUniAI! ✨</span>
          <span className="block text-center mt-2">Ask questions about your conversations</span>
          <span className="block text-center text-xs mt-1 opacity-80">Click the blue AI button or press <kbd className="bg-white/20 px-1 py-0.5 rounded">Alt+A</kbd></span>
          {showInitialTooltip && (
            <div className="absolute -left-10 top-1/2 transform -translate-y-1/2 w-8 h-8 animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="32" height="32">
                <path d="M13.75 22c0 .966-.784 1.75-1.75 1.75s-1.75-.784-1.75-1.75.784-1.75 1.75-1.75 1.75.784 1.75 1.75zM12 2a1 1 0 0 1 1 1v14a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1z"/>
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Welcome modal */}
      {showWelcome && (
        <AIAssistantWelcome
          onClose={() => {
            setShowWelcome(false);
            setHasSeenWelcome(true);
            // Show the chat interface after closing the welcome modal
            setTimeout(() => setShowChatInterface(true), 500);
          }}
        />
      )}

      {/* AI Chat Interface */}
      <AIChatInterface
        isOpen={showChatInterface}
        onClose={() => setShowChatInterface(false)}
        onSubmit={processAIQuery}
        isProcessing={isProcessing}
        client={client}
        selectedContact={selectedContact}
        recentQueries={recentQueries}
      />
    </div>
  );
};

export default AIAssistantButton;
