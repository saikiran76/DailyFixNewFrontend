import React from 'react';
import { FiX } from 'react-icons/fi';
import logger from '../utils/logger';

/**
 * Component to display a preview of the message being replied to
 */
const ReplyPreview = ({ replyToEvent, onCancelReply, client }) => {
  if (!replyToEvent) return null;

  // Get sender information
  const getSenderName = () => {
    try {
      // Try to get the sender from the room member
      const roomId = replyToEvent.getRoomId();
      const senderId = replyToEvent.getSender();

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
          return 'Telegram User';
        }

        // For other users, just use the first part of the Matrix ID
        return senderId.split(':')[0].replace('@', '');
      }
    } catch (error) {
      logger.warn('[ReplyPreview] Error getting sender name:', error);
    }

    return 'Unknown User';
  };

  // Get message content
  const getMessageContent = () => {
    try {
      const content = replyToEvent.getContent();

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
      logger.warn('[ReplyPreview] Error getting message content:', error);
    }

    return 'Unknown message';
  };

  return (
    <div className="border-l-4 border-[#0088cc] bg-neutral-700/50 p-3 mb-3 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm text-white flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#0088cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span className="text-[#0088cc] font-medium mr-1">Replying to</span>
          <span className="font-bold">{getSenderName()}</span>
        </div>
        <button
          onClick={onCancelReply}
          className="text-gray-300 w-auto hover:text-white p-1.5 rounded-full hover:bg-neutral-600 transition-colors"
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
