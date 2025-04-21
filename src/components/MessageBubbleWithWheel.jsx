import React, { useState, useRef, useEffect } from 'react';
import MessageActionWheel from './MessageActionWheel';
import MessageReply from './MessageReply';
import { getParentEventId } from '../utils/replyUtils';
import { getMediaUrl } from '../utils/mediaUtils';
import logger from '../utils/logger';

/**
 * A message bubble component with an action wheel
 */
const MessageBubbleWithWheel = ({
  message,
  client,
  selectedContact,
  parentEvents,
  onReply,
  onDelete,
  onPin,
  onReact
}) => {
  // Get parent event ID if this is a reply
  const parentEventId = message.rawEvent ? getParentEventId(message.rawEvent) : null;
  const parentEvent = parentEventId ? parentEvents[parentEventId] : null;

  // State to track if this message is being hovered
  const [isHovered, setIsHovered] = useState(false);
  // State to track if this is a small message
  const [isSmallMessage, setIsSmallMessage] = useState(false);
  // Reference to the message bubble element
  const messageBubbleRef = useRef(null);

  // Detect message size and position when hovered
  useEffect(() => {
    // Only check size when hovered to improve performance
    if (isHovered && messageBubbleRef.current) {
      // Get the width and position of the message bubble
      const { width, left } = messageBubbleRef.current.getBoundingClientRect();

      // Consider messages less than 150px wide as "small"
      const isSmall = width < 150;

      // Check if message is near the left edge of the screen
      const isNearLeftEdge = left < 70; // 70px from left edge

      // If message is small or near the left edge, use small message styling
      setIsSmallMessage(isSmall || isNearLeftEdge);

      // Log for debugging
      logger.debug(`[MessageBubbleWithWheel] Message size: ${width}px, position: ${left}px, isSmall: ${isSmall}, isNearLeftEdge: ${isNearLeftEdge}`);
    }
  }, [isHovered]);

  // Fallback detection based on message content length
  useEffect(() => {
    // If the message content is very short, it's likely a small message
    if (message.content) {
      let contentLength = 0;

      if (typeof message.content === 'string') {
        contentLength = message.content.length;
      } else if (message.content.body) {
        contentLength = message.content.body.length;
      }

      // Short messages are likely small
      if (contentLength > 0 && contentLength < 10) {
        setIsSmallMessage(true);
      }
    }
  }, [message.content]);

  return (
    <div
      className="relative message-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Only show action wheel when message is hovered */}
      {isHovered && (
        <div
          className={`message-action-wheel-wrapper ${isSmallMessage ? 'small-message' : 'large-message'}`}
          onClick={(e) => e.stopPropagation()} // Prevent clicks from closing the action bar
        >
          <MessageActionWheel
            message={message}
            onReply={() => {
              logger.info(`[MessageBubbleWithWheel] Replying to message: ${message.id}`);
              onReply(message);
            }}
            onDelete={() => {
              logger.info(`[MessageBubbleWithWheel] Delete message: ${message.id}`);
              onDelete?.(message);
            }}
            onPin={() => {
              logger.info(`[MessageBubbleWithWheel] Pin message: ${message.id}`);
              onPin?.(message);
            }}
            onReact={() => {
              logger.info(`[MessageBubbleWithWheel] React to message: ${message.id}`);
              onReact?.(message);
            }}
          />
        </div>
      )}

      <div
        ref={messageBubbleRef}
        className={`message-bubble ${message.isFromMe ? 'message-bubble-sent' : 'message-bubble-received'} ${message.isOptimistic ? 'message-optimistic' : ''}`}
      >
        {/* Sender name for received messages */}
        {!message.isFromMe && (
          <div className="message-sender">
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
                        logger.warn('[MessageBubbleWithWheel] Error getting state events:', error);
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
                        logger.warn('[MessageBubbleWithWheel] Error getting member state:', error);
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
        <div className="message-content">
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
                // Get the image URL
                let imageUrl = message.content.url;

                // Handle mxc:// URLs
                if (imageUrl && imageUrl.startsWith('mxc://') && client) {
                  // Use our media utility to get the URL with proper caching and error handling
                  const isLargeImage = message.content.info &&
                      (message.content.info.w > 800 || message.content.info.h > 800);

                  imageUrl = getMediaUrl(client, imageUrl, {
                    type: isLargeImage ? 'thumbnail' : 'download',
                    width: 800,
                    height: 800,
                    method: 'scale',
                    fallbackUrl: '/images/image-placeholder.png'
                  });
                }

                if (imageUrl) {
                  return (
                    <div className="mt-1">
                      <img
                        src={imageUrl}
                        alt={message.content.body || 'Image'}
                        className="max-w-full rounded-md max-h-[200px] object-contain bg-neutral-950/50"
                        onError={(e) => {
                          // If image fails to load, try using the thumbnail
                          if (message.content.info && message.content.info.thumbnail_url) {
                            let thumbUrl = message.content.info.thumbnail_url;
                            if (thumbUrl.startsWith('mxc://') && client) {
                              thumbUrl = getMediaUrl(client, thumbUrl, {
                                type: 'download',
                                fallbackUrl: '/images/image-placeholder.png'
                              });
                            }
                            e.target.src = thumbUrl;
                          } else {
                            // If no thumbnail, use a placeholder
                            e.target.src = '/images/image-placeholder.png';
                          }
                        }}
                      />
                      {message.content.body && message.content.body !== 'Image' && (
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
          className={`message-timestamp ${message.isFromMe ? 'message-timestamp-sent' : 'message-timestamp-received'}`}
        >
          <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
};

export default MessageBubbleWithWheel;
