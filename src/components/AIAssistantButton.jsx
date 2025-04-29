import React, { useState, useEffect } from 'react';
import { FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';
import api from '../utils/api';
import AIAssistantWelcome from './AIAssistantWelcome';
import AIChatInterface from './AIChatInterface';
import DFLogo from '../images/DF.png';
import { CONFIG } from '../config/aiService';
import '../styles/aiAssistant.css';

/**
 * AI Assistant Button Component
 *
 * A sleek, non-intrusive button that integrates with the Telegram chat interface
 * to provide AI assistant capabilities.
 */
const AIAssistantButton = ({ client, selectedContact, className = "" }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  // State for UI elements
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(true); // Default to true, will check in useEffect
  const [showNewBadge, setShowNewBadge] = useState(true); // Show the "New" badge by default
  const [showInitialTooltip, setShowInitialTooltip] = useState(false); // Show initial tooltip to draw attention
  // We'll use this state for manual tooltip display in the future
  const [showTooltip, setShowTooltip] = useState(false);
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
    let tooltipTimer = null;

    if (initialTooltipShown !== 'true') {
      tooltipTimer = setTimeout(() => {
        setShowInitialTooltip(true);
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setShowInitialTooltip(false);
          localStorage.setItem('ai_assistant_initial_tooltip_shown', 'true');
        }, 5000);
      }, 2000); // Show 2 seconds after component mounts
    }

    // Clean up tooltip timer when component unmounts
    return () => {
      if (tooltipTimer) clearTimeout(tooltipTimer);
    };
  }, []);

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
   * @param {string} query - The query to process
   * @param {boolean} sendToRoom - Whether to send the response to the room (default: true)
   * @returns {Promise<object|null>} - The response data or null if error
   */
  const processAIQuery = async (query, sendToRoom = true) => {
    if (!client || !selectedContact || isProcessing || !query) return null;

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

      // Send a typing indicator message only if we're sending to room
      if (sendToRoom) {
        // CRITICAL FIX: Add null check for client.sendMessage
        try {
          if (client && typeof client.sendMessage === 'function') {
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
          } else {
            logger.warn('[AIAssistant] Could not send typing indicator: client.sendMessage not available');
          }
        } catch (typingError) {
          logger.warn('[AIAssistant] Error sending typing indicator:', typingError);
          // Continue without a typing indicator
        }
      }

      // Get recent messages from timeline
      // CRITICAL FIX: Add null checks for timeline methods
      let events = [];
      try {
        if (room && typeof room.getLiveTimeline === 'function') {
          const timeline = room.getLiveTimeline();
          if (timeline && typeof timeline.getEvents === 'function') {
            events = timeline.getEvents() || [];
          }
        }
      } catch (timelineError) {
        logger.warn('[AIAssistant] Error getting timeline events:', timelineError);
        // Continue with empty events array
      }

      const messages = events
        .filter(event => event.getType && event.getType() === 'm.room.message')
        .slice(-CONFIG.MAX_CONTEXT_MESSAGES)  // Last N messages based on config
        .map(event => {
          // CRITICAL FIX: Add null checks and fallbacks for all event methods
          // This prevents "TypeError: event.getOriginServerTs is not a function" errors
          const getTimestamp = () => {
            if (typeof event.getOriginServerTs === 'function') {
              return event.getOriginServerTs();
            } else if (event.origin_server_ts) {
              return event.origin_server_ts;
            } else {
              return Date.now(); // Fallback to current time
            }
          };

          return {
            id: typeof event.getId === 'function' ? event.getId() : (event.event_id || `msg_${Date.now()}`),
            sender: typeof event.getSender === 'function' ? event.getSender() : (event.sender || 'unknown'),
            content: typeof event.getContent === 'function' ? event.getContent() : (event.content || { body: 'Unknown content' }),
            timestamp: getTimestamp(),
            room_id: roomId
          };
        });

      // Get room context
      const roomContext = {
        room_id: roomId,
        name: room.name || 'Unknown Room',
        members: []
      };

      // CRITICAL FIX: Add null check for getJoinedMembers method
      try {
        if (typeof room.getJoinedMembers === 'function') {
          const members = room.getJoinedMembers() || [];
          roomContext.members = members.map(member => ({
            user_id: member.userId,
            display_name: member.name
          }));
        } else if (room.members) {
          // Alternative way to get members if getJoinedMembers is not available
          const membersList = [];
          for (const userId in room.members) {
            const member = room.members[userId];
            if (member && member.membership === 'join') {
              membersList.push({
                user_id: userId,
                display_name: member.name || userId
              });
            }
          }
          roomContext.members = membersList;
        }
      } catch (membersError) {
        logger.warn('[AIAssistant] Error getting room members:', membersError);
        // Keep empty members array as fallback
      }

      // Get user context
      const userContext = {
        user_id: 'unknown',
        display_name: 'User'
      };

      // CRITICAL FIX: Add null checks for client methods
      try {
        if (typeof client.getUserId === 'function') {
          userContext.user_id = client.getUserId();

          // Only try to get user if getUserId succeeded
          if (typeof client.getUser === 'function') {
            const user = client.getUser(userContext.user_id);
            if (user && user.displayName) {
              userContext.display_name = user.displayName;
            }
          }
        }
      } catch (userError) {
        logger.warn('[AIAssistant] Error getting user context:', userError);
        // Keep default user context as fallback
      }

      logger.info('[AIAssistant] Sending query to AI assistant API');

      // Send request to AI assistant API through the API gateway
      const response = await api.post('/api/v1/ai-bot/query', {
        query,
        messages,
        room_context: roomContext,
        user_context: userContext,
        user_id: userContext.user_id // Add the user_id field explicitly
      });

      const result = response.data;

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

      // Prepare the HTML content for the message
      // For Matrix messages, we need to create HTML that can be sent directly
      const tempDiv = document.createElement('div');

      // Format sources if available with detailed visualization
      let sourcesHtml = '';
      if (result.sources && result.sources.length > 0) {
        const sourcesList = result.sources.map((source) => {
          const formattedTime = source.formatted_time || new Date(source.timestamp).toLocaleString();
          const relevancePercentage = Math.round((source.similarity || 0) * 100);
          const relevanceClass = relevancePercentage > 80 ? 'high-relevance' :
                               relevancePercentage > 60 ? 'medium-relevance' : 'low-relevance';

          return `
            <div class="ai-source-item ${relevanceClass}">
              <div class="ai-source-header">
                <span class="ai-source-sender">${source.sender}</span>
                <span class="ai-source-time">${formattedTime}</span>
                <span class="ai-source-relevance" title="${relevancePercentage}% relevant">🔍 ${relevancePercentage}%</span>
              </div>
              <div class="ai-source-content">${source.content}</div>
            </div>
          `;
        }).join('');

        sourcesHtml = `
          <div class="ai-sources">
            <div class="ai-sources-header">
              <h4>Sources (${result.sources.length})</h4>
              <span class="ai-sources-toggle">👁️ Show/Hide</span>
            </div>
            <div class="ai-sources-list">${sourcesList}</div>
          </div>
        `;
      }

      // Format suggested actions if available
      const actionsHtml = result.suggested_actions && result.suggested_actions.length > 0
        ? `<div class="ai-actions">
            <p><strong>Quick Actions:</strong></p>
            <div class="ai-actions-buttons">
              ${result.suggested_actions.map(action =>
                `<button class="ai-action-button" data-action="${action.action_type}" data-params='${JSON.stringify(action.parameters)}'>
                  ${action.display_text}
                </button>`
              ).join('')}
            </div>
          </div>`
        : '';

      // Add gamification elements
      const gamificationHtml = `
        <div class="ai-gamification">
          <div class="ai-points">🏆 +10 points</div>
          <div class="ai-streak">🔥 3 day streak</div>
          <div class="ai-achievement">🎯 Insight Master <span class="ai-achievement-badge">NEW</span></div>
        </div>
      `;

      // Create HTML content
      tempDiv.innerHTML = `
        <div class="ai-response-container">
          <div class="ai-response-header">
            <img src="${DFLogo}" alt="DailyFix AI" class="ai-logo" width="24" height="24" />
            <span class="ai-title">DailyFix AI</span>
          </div>
          <div class="ai-response-content">
            ${result.response}
          </div>
          ${sourcesHtml}
          ${actionsHtml}
          ${gamificationHtml}
        </div>
      `;

      // Only send to room if sendToRoom is true
      if (sendToRoom) {
        // Note: We can't include scripts in Matrix messages, so we'll use DOM manipulation after sending
        const fullHtml = tempDiv.innerHTML;

        // CRITICAL FIX: Add null checks for client methods
        try {
          // Send AI response to the room with HTML formatting
          // If we have a typing indicator, replace it; otherwise send a new message
          if (client) {
            if (typingMsgId && typeof client.sendMessage === 'function') {
              await client.sendMessage(roomId, {
                msgtype: 'm.room.message',
                body: `🤖 AI Assistant: ${result.response}`,
                format: 'org.matrix.custom.html',
                formatted_body: fullHtml,
                'm.relates_to': {
                  rel_type: 'm.replace',
                  event_id: typingMsgId
                }
              });
            } else if (typeof client.sendHtmlMessage === 'function') {
              await client.sendHtmlMessage(
                roomId,
                `🤖 AI Assistant: ${result.response}`,
                fullHtml
              );
            } else {
              logger.warn('[AIAssistant] Could not send message: client methods not available');
            }
          } else {
            logger.warn('[AIAssistant] Could not send message: client is null');
          }
        } catch (sendError) {
          logger.error('[AIAssistant] Error sending AI response:', sendError);
          // Continue without sending the message
        }

        // After sending, find the message in the DOM and attach event listeners
        setTimeout(() => {
          try {
            const messages = document.querySelectorAll('.ai-sources-toggle');
            messages.forEach(toggle => {
              if (!toggle.hasAttribute('data-listener-attached')) {
                toggle.setAttribute('data-listener-attached', 'true');
                toggle.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const sourcesList = toggle.closest('.ai-sources').querySelector('.ai-sources-list');
                  if (sourcesList) {
                    if (sourcesList.style.display === 'none') {
                      sourcesList.style.display = 'flex';
                      toggle.textContent = '👁️ Hide';
                    } else {
                      sourcesList.style.display = 'none';
                      toggle.textContent = '👁️ Show';
                    }
                  }
                });

                // Hide sources by default
                const sourcesList = toggle.closest('.ai-sources').querySelector('.ai-sources-list');
                if (sourcesList) {
                  sourcesList.style.display = 'none';
                }
              }
            });
          } catch (error) {
            logger.error('[AIAssistant] Error attaching event listeners:', error);
          }
        }, 500);
      }

      // Index messages in the background
      try {
        // CRITICAL FIX: Add null checks for client methods and room methods
        // Get the current user ID safely
        let currentUserId = userContext.user_id; // Use the already safely obtained user ID

        // Send batch of messages to be indexed
        api.post('/api/v1/ai-bot/indexeddb/batch', {
          messages: messages.map(msg => {
            // Get sender name safely
            let senderName = 'Unknown';
            try {
              if (room && typeof room.getMember === 'function' && msg.sender) {
                const member = room.getMember(msg.sender);
                if (member && member.name) {
                  senderName = member.name;
                }
              }
            } catch (memberError) {
              // Ignore errors getting member name
            }

            return {
              id: msg.id,
              sender: msg.sender,
              senderName: senderName,
              content: msg.content,
              timestamp: msg.timestamp,
              roomId: msg.room_id,
              eventType: 'm.room.message',
              isFromMe: msg.sender === currentUserId
            };
          }),
          room_id: roomId,
          user_id: currentUserId
        }).catch(error => {
          logger.error('[AIAssistant] Error indexing messages:', error);
        });
      } catch (indexError) {
        logger.error('[AIAssistant] Error preparing messages for indexing:', indexError);
      }

      // Return the result for use in the chat interface
      return result;

    } catch (error) {
      logger.error('[AIAssistant] Error querying AI assistant:', error);
      toast.error('Sorry, the AI assistant encountered an error');

      // CRITICAL FIX: Store roomId in a variable that's accessible in the catch block
      // If we have a typing indicator and we're sending to room, replace it with an error message
      if (typingMsgId && sendToRoom && selectedContact) {
        try {
          // Get roomId from selectedContact since it might not be in scope from the try block
          const errorRoomId = selectedContact.id;

          // Only proceed if we have a valid roomId
          if (errorRoomId && client && typeof client.sendMessage === 'function') {
            await client.sendMessage(errorRoomId, {
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
          } else {
            logger.warn('[AIAssistant] Could not send error message: missing roomId or client.sendMessage');
          }
        } catch (sendError) {
          logger.error('[AIAssistant] Error sending error message:', sendError);
        }
      }

      // Return null to indicate error
      return null;
    } finally {
      setIsProcessing(false);

      // Don't automatically close the chat interface
      // This allows the user to see the response or error in the interface
      // and try again without reopening if needed
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
