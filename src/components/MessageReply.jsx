import React from 'react';
import logger from '../utils/logger';

/**
 * Component to display a reply within a message
 */
const MessageReply = ({ replyToEvent, client }) => {
  if (!replyToEvent) return null;

  // Get sender information with improved reliability
  const getSenderName = () => {
    try {
      // Check if replyToEvent is already in the processed format (from matrixTimelineManager)
      if (replyToEvent.senderName) {
        return replyToEvent.senderName;
      }

      // Try to get the sender from the room member (original Matrix event format)
      let roomId;
      let senderId;

      if (typeof replyToEvent.getRoomId === 'function') {
        roomId = replyToEvent.getRoomId();
      } else if (replyToEvent.roomId) {
        roomId = replyToEvent.roomId;
      }

      if (typeof replyToEvent.getSender === 'function') {
        senderId = replyToEvent.getSender();
      } else if (replyToEvent.sender) {
        senderId = replyToEvent.sender;
      }

      if (!senderId) {
        return 'Unknown User';
      }

      // For Telegram users, try to extract a better name
      if (senderId.includes('telegram_')) {
        // Extract the Telegram user ID
        const telegramId = senderId.match(/telegram_(\d+)/);
        if (telegramId && telegramId[1]) {
          // First check if we have sender_name in the content
          if (replyToEvent.content && replyToEvent.content.sender_name) {
            return replyToEvent.content.sender_name;
          }

          // Try to get a better name from the room state if available
          if (roomId && client) {
            const room = client.getRoom(roomId);
            if (room) {
              // First try to get from room member
              try {
                const member = room.getMember(senderId);
                if (member && member.name) {
                  return member.name;
                }
              } catch (memberError) {
                logger.warn('[MessageReply] Error getting member:', memberError);
              }

              // If that fails, try to get from room state
              if (room.currentState) {
                try {
                  // Try direct state access first (more efficient)
                  const memberEvent = room.currentState.getStateEvents('m.room.member', senderId);
                  if (memberEvent && typeof memberEvent.getContent === 'function') {
                    const memberContent = memberEvent.getContent();
                    if (memberContent.displayname) {
                      return memberContent.displayname;
                    }
                  }
                } catch (directStateError) {
                  logger.warn('[MessageReply] Error getting direct state:', directStateError);
                }

                try {
                  // Try iterating through all state events as a fallback
                  const stateEvents = room.currentState.getStateEvents('m.room.member');
                  for (const event of stateEvents) {
                    try {
                      const content = event.getContent();
                      const userId = event.getStateKey();
                      if (userId === senderId && content.displayname) {
                        return content.displayname;
                      }
                    } catch (eventError) {
                      // Continue to next event if there's an error
                      continue;
                    }
                  }
                } catch (stateError) {
                  logger.warn('[MessageReply] Error getting state events:', stateError);
                }
              }
            }
          }

          // If we still don't have a name, use a friendly format with the Telegram ID
          return `Telegram User ${telegramId[1]}`;
        }
        return 'Telegram User';
      }

      // For Matrix users, try to get a proper display name
      if (roomId && client) {
        const room = client.getRoom(roomId);
        if (room) {
          try {
            const member = room.getMember(senderId);
            if (member && member.name) {
              return member.name;
            }
          } catch (error) {
            logger.warn('[MessageReply] Error getting Matrix member:', error);
          }
        }
      }

      // For other users, just use the first part of the Matrix ID
      return senderId.split(':')[0].replace('@', '');
    } catch (error) {
      logger.warn('[MessageReply] Error getting sender name:', error);
      return 'Unknown User';
    }
  };

  // Get message content with improved error handling
  const getMessageContent = () => {
    try {
      // Check if replyToEvent is already in the processed format (from matrixTimelineManager)
      if (replyToEvent.body) {
        return replyToEvent.body;
      }

      // Original Matrix event format
      let content;
      if (typeof replyToEvent.getContent === 'function') {
        try {
          content = replyToEvent.getContent();
        } catch (contentError) {
          logger.warn('[MessageReply] Error getting content with getContent():', contentError);
          content = null;
        }
      }

      // Fallback to content property if getContent() failed or doesn't exist
      if (!content && replyToEvent.content) {
        content = replyToEvent.content;
      }

      // If we still don't have content, return a fallback message
      if (!content) {
        return 'Message content unavailable';
      }

      // Handle text messages
      if (content.msgtype === 'm.text') {
        return content.body || content.text || 'Empty message';
      }

      // Handle image messages
      if (content.msgtype === 'm.image') {
        return '[Image] ' + (content.body || 'Image');
      }

      // Handle file messages
      if (content.msgtype === 'm.file') {
        return '[File] ' + (content.body || 'File');
      }

      // Handle video messages
      if (content.msgtype === 'm.video') {
        return '[Video] ' + (content.body || 'Video');
      }

      // Handle audio messages
      if (content.msgtype === 'm.audio') {
        return '[Audio] ' + (content.body || 'Audio');
      }

      // Handle stickers
      if (content.msgtype === 'm.sticker' || replyToEvent.getType?.() === 'm.sticker') {
        return '[Sticker]';
      }

      // Handle other message types
      if (content.body) {
        return content.body;
      }

      // Last resort fallback
      return 'Message';
    } catch (error) {
      logger.warn('[MessageReply] Error getting message content:', error);
      return 'Message content unavailable';
    }
  };

  // Get a color for the sender name based on the sender ID
  const getSenderColor = () => {
    try {
      let senderId;

      if (replyToEvent.sender) {
        senderId = replyToEvent.sender;
      } else if (typeof replyToEvent.getSender === 'function') {
        senderId = replyToEvent.getSender();
      }

      if (!senderId) return '#0088cc'; // Default color

      // Simple hash function to generate a consistent color for each user
      const hash = senderId.split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
      }, 0);

      // Use a set of predefined colors for better readability
      const colors = [
        '#0088cc', // Telegram blue
        '#4caf50', // Green
        '#ff9800', // Orange
        '#e91e63', // Pink
        '#9c27b0', // Purple
        '#2196f3', // Blue
        '#00bcd4', // Cyan
      ];

      return colors[Math.abs(hash) % colors.length];
    } catch (error) {
      return '#0088cc'; // Default color
    }
  };

  return (
    <div className="border-l-2 pl-2 mb-2 text-xs bg-neutral-700/40 p-2 rounded-lg shadow-sm" style={{ borderColor: getSenderColor() }}>
      <div className="font-medium flex items-center gap-1" style={{ color: getSenderColor() }}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
        <div className="flex items-center overflow-hidden">
          <span className="font-bold truncate">{getSenderName()}</span>
        </div>
      </div>
      <div className="text-gray-200 line-clamp-2 break-words pl-4 mt-1 bg-neutral-800/60 p-2 rounded-md">
        {getMessageContent()}
      </div>
    </div>
  );
};

export default MessageReply;
