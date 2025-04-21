import React from 'react';
import { FiX } from 'react-icons/fi';
import logger from '../utils/logger';

/**
 * Component to display a preview of the message being replied to
 */
const ReplyPreview = ({ replyToEvent, onCancelReply, client }) => {
  if (!replyToEvent) return null;

  // Get sender information with improved reliability
  const getSenderName = () => {
    try {
      // Try to get the sender from the room member
      let roomId;
      let senderId;

      try {
        roomId = replyToEvent.getRoomId();
      } catch (error) {
        logger.warn('[ReplyPreview] Error getting roomId:', error);
      }

      try {
        senderId = replyToEvent.getSender();
      } catch (error) {
        logger.warn('[ReplyPreview] Error getting senderId:', error);
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
          try {
            const content = replyToEvent.getContent();
            if (content && content.sender_name) {
              return content.sender_name;
            }
          } catch (contentError) {
            logger.warn('[ReplyPreview] Error getting content:', contentError);
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
                logger.warn('[ReplyPreview] Error getting member:', memberError);
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
                  logger.warn('[ReplyPreview] Error getting direct state:', directStateError);
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
            logger.warn('[ReplyPreview] Error getting Matrix member:', error);
          }
        }
      }

      // For other users, just use the first part of the Matrix ID
      return senderId.split(':')[0].replace('@', '');
    } catch (error) {
      logger.warn('[ReplyPreview] Error getting sender name:', error);
      return 'Unknown User';
    }
  };

  // Get message content with improved error handling
  const getMessageContent = () => {
    try {
      // First check if replyToEvent is already in the processed format
      if (replyToEvent.body) {
        return replyToEvent.body;
      }

      // Try to get content safely
      let content;
      try {
        content = replyToEvent.getContent();
      } catch (contentError) {
        logger.warn('[ReplyPreview] Error getting content:', contentError);
        return 'Message content unavailable';
      }

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

      // Handle other message types
      if (content.body) {
        return content.body;
      }

      // Last resort fallback
      return 'Message';
    } catch (error) {
      logger.warn('[ReplyPreview] Error getting message content:', error);
      return 'Message content unavailable';
    }
  };

  return (
    <div className="border-l-4 border-[#0088cc] bg-neutral-700/50 p-3 mb-3 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm text-white flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#0088cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span className="text-[#0088cc] font-medium mr-1">Replying</span>
        </div>
        <button
          onClick={onCancelReply}
          className="text-gray-300 w-auto bg-neutral-800 hover:text-white p-1.5 rounded-full hover:bg-neutral-600 transition-colors"
          aria-label="Cancel reply"
        >
          <FiX size={18} />
        </button>
      </div>
      <div className="text-sm text-gray-300 line-clamp-2 break-words bg-neutral-800/50 p-2 rounded-md">
        {getMessageContent()}
      </div>
    </div>
  );
};

export default ReplyPreview;
