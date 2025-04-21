import React from 'react';
import MessageActionWheel from './MessageActionWheel';
import MessageReply from './MessageReply';
import { getParentEventId } from '../utils/replyUtils';
import logger from '../utils/logger';

/**
 * A component that renders a message bubble with an action wheel
 */
const MessageBubbleWithActions = ({ 
  message, 
  client, 
  selectedContact,
  onReply,
  isFromMe,
  parentEvents
}) => {
  // Get parent event ID if this is a reply
  const parentEventId = message.rawEvent ? getParentEventId(message.rawEvent) : null;
  const parentEvent = parentEventId ? parentEvents[parentEventId] : null;
  
  return (
    <div className="relative">
      {/* Message Action Wheel */}
      <MessageActionWheel
        message={message}
        onReply={() => {
          logger.info(`[MessageBubbleWithActions] Replying to message: ${message.id}`);
          onReply(message);
        }}
        onDelete={() => {
          logger.info(`[MessageBubbleWithActions] Delete message functionality not implemented yet`);
          /* To be implemented */
        }}
        onPin={() => {
          logger.info(`[MessageBubbleWithActions] Pin message functionality not implemented yet`);
          /* To be implemented */
        }}
        onReact={() => {
          logger.info(`[MessageBubbleWithActions] React to message functionality not implemented yet`);
          /* To be implemented */
        }}
      />

      <div
        className={`max-w-[75%] rounded-2xl p-3 shadow-sm transition-all duration-200 ${
          isFromMe
            ? 'bg-gradient-to-br from-[#0088cc] to-[#0077b6] text-white rounded-tr-none'
            : 'bg-neutral-800 text-white rounded-tl-none'
        } hover:shadow-md`}
      >
        {/* Sender name for received messages */}
        {!isFromMe && (
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
                  // Try to extract a more user-friendly name from the room state
                  const telegramId = message.sender.match(/telegram_(\d+)/);
                  if (telegramId && telegramId[1]) {
                    // Look for a display name in the room state
                    const room = client.getRoom(selectedContact.id);
                    if (room && room.currentState) {
                      // Try to get from room state events
                      try {
                        const stateEvents = room.currentState.getStateEvents('m.room.member');
                        for (const event of stateEvents) {
                          const content = event.getContent();
                          const userId = event.getStateKey();
                          if (userId === message.sender && content.displayname) {
                            return content.displayname;
                          }
                        }
                      } catch (error) {
                        logger.warn('[MessageBubbleWithActions] Error getting state events:', error);
                      }

                      // Try to get directly from the member state
                      try {
                        const memberEvent = room.currentState.getStateEvents('m.room.member', message.sender);
                        if (memberEvent && typeof memberEvent.getContent === 'function') {
                          const memberContent = memberEvent.getContent();
                          if (memberContent.displayname) {
                            return memberContent.displayname;
                          }
                        }
                      } catch (error) {
                        logger.warn('[MessageBubbleWithActions] Error getting member state:', error);
                      }
                    }

                    // Try to extract from the message content
                    if (message.content && message.content.sender_name) {
                      return message.content.sender_name;
                    }

                    return `Telegram User ${telegramId[1]}`;
                  }
                }

                // Last resort: use the Matrix ID
                return message.sender;
              }
              
              return 'Unknown User';
            })()}
          </div>
        )}

        {/* If this is a reply, show the message it's replying to */}
        {parentEvent && (
          <MessageReply
            replyToEvent={parentEvent}
            client={client}
          />
        )}

        {/* Message content */}
        <div className="break-words text-sm leading-relaxed">
          {(() => {
            // Handle different message content types
            if (!message.content) {
              return 'Message content unavailable';
            }

            if (typeof message.content === 'string') {
              return message.content;
            }

            if (typeof message.content === 'object') {
              // Handle text messages
              if (message.content.body) {
                return message.content.body;
              }

              // Handle text messages with msgtype
              if (message.content.msgtype === 'm.text' && message.content.text) {
                return message.content.text;
              }

              // Handle image messages
              if (message.content.msgtype === 'm.image') {
                const imageUrl = message.content.url && client ?
                  client.mxcUrlToHttp(message.content.url) :
                  null;

                if (imageUrl) {
                  return (
                    <div className="mt-1">
                      <img
                        src={imageUrl}
                        alt={message.content.body || 'Image'}
                        className="max-w-full rounded-md max-h-[200px]"
                      />
                      {message.content.body && message.content.body !== 'Image' && (
                        <div className="mt-1 text-xs text-gray-400">{message.content.body}</div>
                      )}
                    </div>
                  );
                }
              }

              // Handle video messages
              if (message.content.msgtype === 'm.video') {
                const videoUrl = message.content.url && client ?
                  client.mxcUrlToHttp(message.content.url) :
                  null;

                if (videoUrl) {
                  return (
                    <div className="mt-1">
                      <video
                        controls
                        className="max-w-full rounded-md max-h-[200px] bg-neutral-950/50"
                        poster={message.content.info?.thumbnail_url && client ?
                          client.mxcUrlToHttp(message.content.info.thumbnail_url) :
                          '/images/video-placeholder.png'}
                      >
                        <source src={videoUrl} type={message.content.info?.mimetype || 'video/mp4'} />
                        Your browser does not support the video tag.
                      </video>
                      {message.content.body && message.content.body !== 'Video' && (
                        <div className="mt-1 text-xs text-gray-400">{message.content.body}</div>
                      )}
                    </div>
                  );
                }
              }

              // Handle file messages
              if (message.content.msgtype === 'm.file') {
                const fileUrl = message.content.url && client ?
                  client.mxcUrlToHttp(message.content.url) :
                  null;

                if (fileUrl) {
                  return (
                    <div className="mt-1">
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center p-2 bg-neutral-700 rounded-md hover:bg-neutral-600 transition-colors"
                      >
                        <span className="text-blue-300 mr-2">📎</span>
                        <span>{message.content.body || 'File'}</span>
                      </a>
                    </div>
                  );
                }
              }

              // Handle audio messages
              if (message.content.msgtype === 'm.audio') {
                const audioUrl = message.content.url && client ?
                  client.mxcUrlToHttp(message.content.url) :
                  null;

                if (audioUrl) {
                  return (
                    <div className="mt-1">
                      <audio
                        controls
                        className="max-w-full"
                      >
                        <source src={audioUrl} type={message.content.info?.mimetype || 'audio/mpeg'} />
                        Your browser does not support the audio tag.
                      </audio>
                      {message.content.body && message.content.body !== 'Audio' && (
                        <div className="mt-1 text-xs text-gray-400">{message.content.body}</div>
                      )}
                    </div>
                  );
                }
              }
            }

            return 'Message content unavailable';
          })()}
        </div>

        {/* Timestamp */}
        <div
          className={`text-[10px] mt-1 ${
            isFromMe ? 'text-blue-200' : 'text-gray-400'
          } text-right flex items-center justify-end`}
        >
          <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
};

export default MessageBubbleWithActions;
