import React from 'react';
import MessageActionWheel from './MessageActionWheel';
import MessageReply from './MessageReply';
import { getParentEventId } from '../utils/replyUtils';
import logger from '../utils/logger';

/**
 * A component that renders a message bubble with an action wheel
 */
const MessageBubble = ({ 
  message, 
  client, 
  selectedContact,
  onReply,
  renderMessageContent 
}) => {
  // Check if this message is a reply to another message
  const parentEventId = getParentEventId(message);
  
  return (
    <div className="relative">
      {/* Message Action Wheel */}
      <MessageActionWheel
        message={message}
        onReply={() => {
          logger.info(`[MessageBubble] Replying to message: ${message.id}`);
          onReply(message);
        }}
        onDelete={() => {
          logger.info(`[MessageBubble] Delete message functionality not implemented yet`);
          /* To be implemented */
        }}
        onPin={() => {
          logger.info(`[MessageBubble] Pin message functionality not implemented yet`);
          /* To be implemented */
        }}
        onReact={() => {
          logger.info(`[MessageBubble] React to message functionality not implemented yet`);
          /* To be implemented */
        }}
      />

      <div
        className={`max-w-[75%] rounded-2xl p-3 shadow-sm transition-all duration-200 ${
          message.isFromMe
            ? 'bg-gradient-to-br from-[#0088cc] to-[#0077b6] text-white rounded-tr-none'
            : 'bg-neutral-800 text-white rounded-tl-none'
        } hover:shadow-md`}
      >
        {/* Sender name for received messages */}
        {!message.isFromMe && (
          <div className="text-xs font-medium text-blue-300 mb-1">
            {(() => {
              // First check if we have a senderName in the message object
              if (message.senderName && message.senderName !== message.sender) {
                return message.senderName;
              }

              // Get proper display name from room member
              if (message.sender && client) {
                const roomId = selectedContact.id;
                const room = client.getRoom(roomId);

                if (room) {
                  const member = room.getMember(message.sender);
                  if (member && member.name) {
                    return member.name;
                  }
                }

                // Fallback: For Telegram users, try to get a better name
                if (message.sender.includes('telegram_')) {
                  // Try to extract a more user-friendly name
                  if (message.content && message.content.sender_name) {
                    return message.content.sender_name;
                  }
                  
                  return 'Telegram User';
                }

                // Last resort: use the Matrix ID
                return message.sender;
              }
              
              return 'Unknown User';
            })()}
          </div>
        )}

        {/* If this is a reply, show the message it's replying to */}
        {parentEventId && (
          <MessageReply
            eventId={parentEventId}
            roomId={selectedContact.id}
            client={client}
          />
        )}

        {/* Message content */}
        {renderMessageContent()}

        {/* Timestamp */}
        <div
          className={`text-[10px] mt-1 ${
            message.isFromMe ? 'text-blue-200' : 'text-gray-400'
          } text-right flex items-center justify-end`}
        >
          <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
