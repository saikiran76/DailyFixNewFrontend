import React from 'react';
import logger from '../utils/logger';

/**
 * Component to display a reply within a message
 */
const MessageReply = ({ replyToEvent, client }) => {
  if (!replyToEvent) return null;

  // Get sender information
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

      if (roomId && senderId && client) {
        const room = client.getRoom(roomId);
        if (room) {
          // First try to get from room member
          const member = room.getMember(senderId);
          if (member && member.name) {
            return member.name;
          }

          // If that fails, try to get from room state
          if (room.currentState) {
            const stateEvents = room.currentState.getStateEvents('m.room.member');
            for (const event of stateEvents) {
              const content = event.getContent();
              const userId = event.getStateKey();
              if (userId === senderId && content.displayname) {
                return content.displayname;
              }
            }
          }
        }
      }

      // Fallback: Extract username from Matrix ID
      if (senderId) {
        // For Telegram users, the format is usually @telegram_123456789:server.org
        if (senderId.includes('telegram_')) {
          // Extract the Telegram user ID
          const telegramId = senderId.match(/telegram_(\d+)/);
          if (telegramId && telegramId[1]) {
            // Try to get a better name from the room state if available
            if (roomId && client) {
              const room = client.getRoom(roomId);
              if (room && room.currentState) {
                // Look for any state events that might have the user's name
                const stateEvents = room.currentState.getStateEvents('m.room.member');
                for (const event of stateEvents) {
                  if (typeof event.getStateKey === 'function' &&
                      event.getStateKey() === senderId &&
                      typeof event.getContent === 'function' &&
                      event.getContent().displayname) {
                    return event.getContent().displayname;
                  }
                }

                // Try another approach with direct state access
                const memberEvent = room.currentState.getStateEvents('m.room.member', senderId);
                if (memberEvent && typeof memberEvent.getContent === 'function') {
                  const memberContent = memberEvent.getContent();
                  if (memberContent.displayname) {
                    return memberContent.displayname;
                  }
                }
              }
            }

            // Try to get name from the event content if available
            if (replyToEvent.content && replyToEvent.content.sender_name) {
              return replyToEvent.content.sender_name;
            }

            return `Telegram User ${telegramId[1]}`;
          }
          return 'Telegram User';
        }

        // For other users, just use the first part of the Matrix ID
        return senderId.split(':')[0].replace('@', '');
      }
    } catch (error) {
      logger.warn('[MessageReply] Error getting sender name:', error);
    }

    return 'Unknown User';
  };

  // Get message content
  const getMessageContent = () => {
    try {
      // Check if replyToEvent is already in the processed format (from matrixTimelineManager)
      if (replyToEvent.body) {
        return replyToEvent.body;
      }

      // Original Matrix event format
      let content;
      if (typeof replyToEvent.getContent === 'function') {
        content = replyToEvent.getContent();
      } else if (replyToEvent.content) {
        content = replyToEvent.content;
      } else {
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

      // Handle other message types
      if (content.body) {
        return content.body;
      }
    } catch (error) {
      logger.warn('[MessageReply] Error getting message content:', error);
    }

    return 'Unknown message';
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
    <div className="border-l-2 pl-2 mb-2 text-xs bg-neutral-700/50 p-2 rounded-md" style={{ borderColor: getSenderColor() }}>
      <div className="font-medium flex items-center" style={{ color: getSenderColor() }}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
        <div className="flex items-center overflow-hidden">
          <span className="font-bold truncate">{getSenderName()}</span>
        </div>
      </div>
      <div className="text-gray-300 line-clamp-1 break-words pl-4 mt-1 bg-neutral-800/50 p-1 rounded">
        {getMessageContent()}
      </div>
    </div>
  );
};

export default MessageReply;
