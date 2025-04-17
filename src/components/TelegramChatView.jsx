import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiMessageCircle, FiUser, FiUsers, FiPaperclip, FiImage, FiSmile, FiMic, FiCornerUpLeft } from 'react-icons/fi';
import { useMatrixClient } from '../context/MatrixClientContext';
import { toast } from 'react-hot-toast';
import matrixTimelineManager from '../utils/matrixTimelineManager';
import logger from '../utils/logger';
import ChatConfirmation from './ChatConfirmation';
import RoomMemberList from './RoomMemberList';
import ReplyPreview from './ReplyPreview';
import MessageReply from './MessageReply';
import { getParentEventId, addReplyToMessageContent } from '../utils/replyUtils';
import { getMediaUrl, getFallbackAvatarUrl } from '../utils/mediaUtils';

const TelegramChatView = ({ selectedContact }) => {
  const { client, loading: clientLoading } = useMatrixClient() || {};
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestEventId, setOldestEventId] = useState(null);
  const messagesEndRef = useRef(null);

  // Confirmation and room joining states
  const [needsConfirmation, setNeedsConfirmation] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  // Room members panel state
  const [showMemberList, setShowMemberList] = useState(false);

  // Reply state
  const [replyToEvent, setReplyToEvent] = useState(null);
  const [parentEvents, setParentEvents] = useState({});

  // Check if user has already confirmed viewing this chat
  useEffect(() => {
    if (selectedContact) {
      logger.info('[TelegramChatView] Selected contact:', selectedContact);

      // Check if the room is in 'invite' state
      if (client) {
        const room = client.getRoom(selectedContact.id);
        if (room) {
          const membership = room.getMyMembership();
          logger.info(`[TelegramChatView] Room membership state: ${membership}`);
        } else {
          logger.warn(`[TelegramChatView] Room not found for ID: ${selectedContact.id}`);
        }
      }

      try {
        const confirmedChats = JSON.parse(localStorage.getItem('confirmed_chats') || '[]');
        if (confirmedChats.includes(selectedContact.id)) {
          logger.info(`[TelegramChatView] Chat already confirmed: ${selectedContact.id}`);
          setNeedsConfirmation(false);
        } else {
          logger.info(`[TelegramChatView] Chat needs confirmation: ${selectedContact.id}`);
          setNeedsConfirmation(true);
        }
      } catch (e) {
        logger.error('[TelegramChatView] Error checking confirmed chats:', e);
        setNeedsConfirmation(true);
      }
    }
  }, [selectedContact, client]);

  // Handle room joining
  const handleConfirmViewChat = async () => {
    if (!selectedContact || !client) {
      logger.error('[TelegramChatView] Cannot confirm view chat: selectedContact or client is null');
      return;
    }

    logger.info('[TelegramChatView] Confirming view chat for:', selectedContact.name);

    try {
      // Check if room needs joining (has 'invite' state)
      const room = client.getRoom(selectedContact.id);
      if (room) {
        const membership = room.getMyMembership();
        logger.info(`[TelegramChatView] Room membership state before joining: ${membership}`);

        if (membership === 'invite') {
          setIsJoining(true);
          setJoinError(null);

          // Join the room
          logger.info(`[TelegramChatView] Joining room ${selectedContact.id}`);
          await client.joinRoom(selectedContact.id);

          // Wait a moment for the room state to update
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Check membership after joining
          const updatedMembership = room.getMyMembership();
          logger.info(`[TelegramChatView] Room membership state after joining: ${updatedMembership}`);
        } else {
          logger.info(`[TelegramChatView] Room already joined with membership: ${membership}`);
        }
      } else {
        logger.warn(`[TelegramChatView] Room not found for ID: ${selectedContact.id}`);
      }

      // Save confirmation to localStorage
      const confirmedChats = JSON.parse(localStorage.getItem('confirmed_chats') || '[]');
      if (!confirmedChats.includes(selectedContact.id)) {
        confirmedChats.push(selectedContact.id);
        localStorage.setItem('confirmed_chats', JSON.stringify(confirmedChats));
        logger.info(`[TelegramChatView] Added ${selectedContact.id} to confirmed chats`);
      }

      // Update state
      setNeedsConfirmation(false);
      setIsJoining(false);
      setJoinError(null);

      // Load messages
      logger.info('[TelegramChatView] Loading messages after confirmation');
      loadMessages();
    } catch (error) {
      logger.error('[TelegramChatView] Error joining room:', error);
      setJoinError(error.message || 'Failed to join the chat. Please try again.');
      setIsJoining(false);
    }
  };

  // Load messages when selected contact changes and confirmation is not needed
  useEffect(() => {
    if (selectedContact && client && !needsConfirmation) {
      loadMessages();

      // Set up real-time message tracking
      const handleRoomTimeline = (event, room) => {
        // Only process events for the selected room
        if (!room || room.roomId !== selectedContact.id) return;

        // Only process message events
        if (event.getType() !== 'm.room.message') return;

        // Add isLiveEvent function if it doesn't exist
        if (typeof event.isLiveEvent !== 'function') {
          event.isLiveEvent = () => true; // Assume all events are live events
        }

        // Skip non-live events
        if (!event.isLiveEvent()) return;

        logger.info(`[TelegramChatView] New message received in room ${room.roomId}`);

        // Process the event into a message
        if (matrixTimelineManager && matrixTimelineManager.initialized) {
          const newMessage = matrixTimelineManager._createMessageFromEvent(event, room);

          if (newMessage) {
            // Check if we already have this message
            const existingMessage = messages.find(msg => msg.id === newMessage.id);
            if (!existingMessage) {
              // Add the new message to the list
              setMessages(prevMessages => [...prevMessages, newMessage]);

              // If the message is a reply, fetch the parent event
              if (newMessage.replyToEventId) {
                fetchParentEvents([newMessage]);
              }

              // Scroll to bottom
              if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }

              // Mark the message as read if it's not from the current user
              if (!newMessage.isFromMe) {
                try {
                  // Send read receipt for the event
                  client.sendReadReceipt(event);
                  logger.info(`[TelegramChatView] Sent read receipt for new message in room ${room.roomId}`);
                } catch (error) {
                  logger.warn(`[TelegramChatView] Error sending read receipt for new message:`, error);
                }
              }
            }
          }
        }
      };

      // Add event listener
      client.on('Room.timeline', handleRoomTimeline);

      // Return cleanup function
      return () => {
        client.removeListener('Room.timeline', handleRoomTimeline);
      };
    }
  }, [selectedContact, client, needsConfirmation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Helper function to show welcome messages
  const showWelcomeMessages = (customMessage) => {
    const welcomeMessages = [
      {
        id: 'welcome-1',
        sender: '@telegrambot:dfix-hsbridge.duckdns.org',
        content: {
          msgtype: 'm.text',
          body: customMessage || 'Welcome to Telegram! You are now connected to your Telegram account.'
        },
        timestamp: Date.now() - 60000,
        isFromMe: false
      },
      {
        id: 'welcome-2',
        sender: '@telegrambot:dfix-hsbridge.duckdns.org',
        content: {
          msgtype: 'm.text',
          body: 'You can now send and receive messages from your Telegram contacts.'
        },
        timestamp: Date.now() - 30000,
        isFromMe: false
      }
    ];

    setMessages(welcomeMessages);
  };

  // Fetch parent events for replies
  const fetchParentEvents = async (messages) => {
    if (!client || !messages || messages.length === 0) return {};

    const newParentEvents = { ...parentEvents };
    const eventIdsToFetch = [];

    // Find all messages that are replies and collect their parent event IDs
    messages.forEach(message => {
      if (message.rawEvent) {
        // Try to get parent ID using getParentEventId function
        const parentId = getParentEventId(message.rawEvent);
        if (parentId && parentId !== 'fallback_format' && !newParentEvents[parentId]) {
          eventIdsToFetch.push(parentId);
        }
      } else if (message.content && message.content['m.relates_to'] && message.content['m.relates_to']['m.in_reply_to']) {
        // Handle ElementMatrixClient format
        const parentId = message.content['m.relates_to']['m.in_reply_to'].event_id;
        if (parentId && !newParentEvents[parentId]) {
          eventIdsToFetch.push(parentId);
        }
      }
    });

    // Fetch all parent events in parallel
    if (eventIdsToFetch.length > 0) {
      logger.info(`[TelegramChatView] Fetching ${eventIdsToFetch.length} parent events for replies`);

      const roomId = selectedContact.id;

      // Initialize MatrixTimelineManager if needed
      if (!matrixTimelineManager.initialized) {
        matrixTimelineManager.initialize(client);
      }

      const fetchPromises = eventIdsToFetch.map(async (eventId) => {
        try {
          // Use MatrixTimelineManager to get the parent event
          const event = await matrixTimelineManager.getParentEvent(roomId, eventId);

          if (event) {
            // Add methods that MessageReply component might expect
            if (typeof event.getRoomId !== 'function') {
              event.getRoomId = () => roomId;
            }

            if (typeof event.getSender !== 'function' && event.sender) {
              event.getSender = () => event.sender;
            }

            if (typeof event.getContent !== 'function' && event.content) {
              event.getContent = () => event.content;
            }

            newParentEvents[eventId] = event;
            logger.info(`[TelegramChatView] Successfully fetched parent event: ${eventId}`);
            return { eventId, event };
          }

          logger.warn(`[TelegramChatView] Could not find parent event: ${eventId}`);
          return { eventId, event: null };
        } catch (error) {
          logger.warn(`[TelegramChatView] Error fetching parent event ${eventId}:`, error);
          return { eventId, event: null };
        }
      });

      const results = await Promise.all(fetchPromises);
      const successCount = results.filter(r => r.event).length;
      logger.info(`[TelegramChatView] Fetched ${successCount} out of ${eventIdsToFetch.length} parent events`);
    }

    setParentEvents(newParentEvents);
    return newParentEvents;
  };

  // Load messages using our new MatrixMessageLoader for reliable message loading
  const loadMessages = async () => {
    if (!selectedContact || !client) {
      logger.error('[TelegramChatView] Cannot load messages: selectedContact or client is null');
      return;
    }

    logger.info(`[TelegramChatView] Loading messages for contact: ${selectedContact.name} (${selectedContact.id})`);
    setLoading(true);
    setError(null);

    try {
      // If the selected contact is a placeholder, show a welcome message
      if (selectedContact.isPlaceholder) {
        logger.info('[TelegramChatView] Selected contact is a placeholder, showing welcome message');
        showWelcomeMessages();
        return;
      }

      // Initialize MatrixTimelineManager
      if (!matrixTimelineManager.initialized) {
        logger.info('[TelegramChatView] Initializing MatrixTimelineManager');
        try {
          const initialized = matrixTimelineManager.initialize(client);

          if (!initialized) {
            logger.error('[TelegramChatView] Failed to initialize MatrixTimelineManager');
            showWelcomeMessages('Error initializing message loader. Please try again later.');
            return;
          }
        } catch (error) {
          logger.error('[TelegramChatView] Error initializing MatrixTimelineManager:', error);
          showWelcomeMessages('Error initializing message loader. Please try again later.');
          return;
        }
      }

      // Load messages using MatrixTimelineManager with a higher limit to ensure we get ALL messages
      const loadedMessages = await matrixTimelineManager.loadMessages(selectedContact.id, {
        limit: 500, // Much higher limit to ensure we get ALL messages
        forceRefresh: true // Force refresh to get the latest messages
      });

      // Log the message count by type for debugging
      const messageTypeCount = {};
      loadedMessages.forEach(msg => {
        const type = msg.eventType || 'unknown';
        messageTypeCount[type] = (messageTypeCount[type] || 0) + 1;
      });
      logger.info(`[TelegramChatView] Message type counts: ${JSON.stringify(messageTypeCount)}`);

      // Mark all messages as read
      try {
        const room = client.getRoom(selectedContact.id);
        if (room) {
          // Get the latest event in the room
          const timeline = room.getLiveTimeline();
          if (timeline) {
            const events = timeline.getEvents();
            if (events && events.length > 0) {
              const latestEvent = events[events.length - 1];
              // Send read receipt for the latest event
              client.sendReadReceipt(latestEvent);
              logger.info(`[TelegramChatView] Sent read receipt for latest event in room ${selectedContact.id}`);
            }
          }
        }
      } catch (error) {
        logger.warn(`[TelegramChatView] Error sending read receipt:`, error);
      }

      // If no messages were found, show welcome message
      if (!loadedMessages || loadedMessages.length === 0) {
        logger.warn('[TelegramChatView] No messages found, showing welcome message');
        showWelcomeMessages('No messages found. Start a conversation!');
        return;
      }

      logger.info(`[TelegramChatView] Successfully loaded ${loadedMessages.length} messages`);

      // Fetch parent events for replies
      await fetchParentEvents(loadedMessages);

      // Update state with loaded messages
      setMessages(loadedMessages);

      // Store the oldest event ID for pagination
      if (loadedMessages.length > 0) {
        // Find the oldest message by timestamp
        const oldestMessage = [...loadedMessages].sort((a, b) => a.timestamp - b.timestamp)[0];
        if (oldestMessage && oldestMessage.id) {
          setOldestEventId(oldestMessage.id);
        }

        // Determine if there might be more messages
        setHasMoreMessages(loadedMessages.length >= 200);
      } else {
        setHasMoreMessages(false);
      }

      // Set up real-time updates
      setupRealTimeUpdates(selectedContact.id);
    } catch (error) {
      logger.error('[TelegramChatView] Error loading messages:', error);
      setError('Failed to load messages');
      showWelcomeMessages('Error loading messages. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Note: We're now using MatrixMessageLoader to process events into messages
  // Keeping this function for reference
  const processEventsToMessages = async (events) => {
    if (!events || !Array.isArray(events) || events.length === 0) {
      return [];
    }

    logger.info(`[TelegramChatView] Processing ${events.length} events into messages`);

    const messages = [];
    const processedEventIds = new Set(); // To avoid duplicates

    // First pass: collect all message events
    for (const event of events) {
      try {
        // Skip null or undefined events
        if (!event) continue;

        // Get event type
        let eventType = null;
        if (typeof event.getType === 'function') {
          eventType = event.getType();
        } else if (event.type) {
          eventType = event.type;
        } else if (typeof event.get === 'function' && event.get('type')) {
          eventType = event.get('type');
        } else if (event.event && event.event.type) {
          eventType = event.event.type;
        } else if (event.content && event.content.msgtype) {
          eventType = 'm.room.message';
        } else if (event.event && event.event.content && event.event.content.msgtype) {
          eventType = 'm.room.message';
        }

        // Skip if not a message event
        if (eventType !== 'm.room.message') {
          continue;
        }

        // Get event ID
        let id = null;
        if (typeof event.getId === 'function') {
          id = event.getId();
        } else if (event.event_id) {
          id = event.event_id;
        } else if (event.id) {
          id = event.id;
        } else {
          id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }

        // Skip if already processed
        if (processedEventIds.has(id)) {
          continue;
        }

        // Get sender
        let sender = null;
        if (typeof event.getSender === 'function') {
          sender = event.getSender();
        } else if (event.sender) {
          sender = event.sender;
        } else if (event.user_id) {
          sender = event.user_id;
        } else if (event.event && event.event.sender) {
          sender = event.event.sender;
        } else {
          sender = 'Unknown';
        }

        // Get content
        let content = null;
        if (typeof event.getContent === 'function') {
          content = event.getContent();
        } else if (event.content) {
          content = event.content;
        } else if (event.event && event.event.content) {
          content = event.event.content;
        } else if (typeof event.get === 'function' && event.get('content')) {
          content = event.get('content');
        } else {
          content = { body: 'Message content unavailable' };
        }

        // If content doesn't have a body but has formatted_body, use that
        if (content && !content.body && content.formatted_body) {
          content.body = content.formatted_body.replace(/<[^>]*>/g, '');
        }

        // If content is empty or doesn't have a body, skip this message
        if (!content || (!content.body && !content.text)) {
          continue;
        }

        // Get timestamp
        let timestamp = null;
        if (typeof event.getOriginServerTs === 'function') {
          timestamp = event.getOriginServerTs();
        } else if (event.origin_server_ts) {
          timestamp = event.origin_server_ts;
        } else if (event.timestamp) {
          timestamp = event.timestamp;
        } else if (event.event && event.event.origin_server_ts) {
          timestamp = event.event.origin_server_ts;
        } else {
          timestamp = Date.now();
        }

        // Check if message is from current user
        const isFromMe = sender === client.getUserId();

        // Add to messages array
        messages.push({
          id,
          sender,
          content,
          timestamp,
          isFromMe,
          eventType,
          rawEvent: event // Store the raw event for reference
        });

        // Mark as processed
        processedEventIds.add(id);
      } catch (error) {
        logger.warn(`[TelegramChatView] Error processing event:`, error);
      }
    }

    // Second pass: collect reaction events and attach them to messages
    for (const event of events) {
      try {
        // Skip null or undefined events
        if (!event) continue;

        // Get event type
        let eventType = null;
        if (typeof event.getType === 'function') {
          eventType = event.getType();
        } else if (event.type) {
          eventType = event.type;
        } else if (event.content && event.content['m.relates_to'] &&
                  event.content['m.relates_to'].rel_type === 'm.annotation') {
          eventType = 'm.reaction';
        }

        // Skip if not a reaction event
        if (eventType !== 'm.reaction') {
          continue;
        }

        // Get the related event ID
        let relatedEventId = null;
        let reactionKey = null;

        if (event.content && event.content['m.relates_to']) {
          relatedEventId = event.content['m.relates_to'].event_id;
          reactionKey = event.content['m.relates_to'].key;
        }

        if (!relatedEventId || !reactionKey) {
          continue;
        }

        // Find the related message
        const relatedMessage = messages.find(msg => msg.id === relatedEventId);
        if (relatedMessage) {
          // Add the reaction to the message
          if (!relatedMessage.reactions) {
            relatedMessage.reactions = [];
          }

          // Get sender
          let sender = null;
          if (typeof event.getSender === 'function') {
            sender = event.getSender();
          } else if (event.sender) {
            sender = event.sender;
          } else {
            sender = 'Unknown';
          }

          // Add the reaction if not already present
          const existingReaction = relatedMessage.reactions.find(r =>
            r.key === reactionKey && r.sender === sender
          );

          if (!existingReaction) {
            relatedMessage.reactions.push({
              key: reactionKey,
              sender,
              timestamp: event.origin_server_ts || Date.now()
            });
          }
        }
      } catch (error) {
        logger.warn(`[TelegramChatView] Error processing reaction:`, error);
      }
    }

    logger.info(`[TelegramChatView] Processed ${messages.length} messages from ${events.length} events`);
    return messages;
  };

  // Set up real-time updates for a room using MatrixTimelineManager
  const setupRealTimeUpdates = (roomId) => {
    if (!roomId || !client) return;

    logger.info(`[TelegramChatView] Setting up real-time updates for room ${roomId}`);

    // Set up real-time updates using MatrixTimelineManager
    matrixTimelineManager.addRoomListener(roomId, 'timeline', (event, room) => {
      // Process the event into a message
      const newMessage = matrixTimelineManager._createMessageFromEvent(event, room);
      // When a new message is received, add it to the messages state
      setMessages(prevMessages => {
        // Check if the message already exists
        const exists = prevMessages.some(msg => msg.id === newMessage.id);
        if (exists) return prevMessages;

        // Add the new message and sort by timestamp
        const updatedMessages = [...prevMessages, newMessage];
        return updatedMessages.sort((a, b) => a.timestamp - b.timestamp);
      });

      // If the message is a reply, fetch the parent event
      if (newMessage.rawEvent) {
        const parentId = getParentEventId(newMessage.rawEvent);
        if (parentId && parentId !== 'fallback_format') {
          fetchParentEvents([newMessage]);
        }
      }
    });
  };

  // Load more messages (older messages)
  const loadMoreMessages = async () => {
    if (!selectedContact || !client || !oldestEventId || loadingMore || !hasMoreMessages) {
      return;
    }

    setLoadingMore(true);
    try {
      logger.info(`[TelegramChatView] Loading more messages before ${oldestEventId}`);

      // Initialize MatrixTimelineManager if not already initialized
      if (!matrixTimelineManager.initialized) {
        logger.info('[TelegramChatView] Initializing MatrixTimelineManager');
        try {
          const initialized = matrixTimelineManager.initialize(client);

          if (!initialized) {
            logger.error('[TelegramChatView] Failed to initialize MatrixTimelineManager');
            return;
          }
        } catch (error) {
          logger.error('[TelegramChatView] Error initializing MatrixTimelineManager:', error);
          return;
        }
      }

      // Use MatrixTimelineManager to load more messages
      const olderMessages = await matrixTimelineManager.loadMessages(selectedContact.id, {
        limit: 100,
        direction: 'b', // backwards to get historical messages
        from: oldestEventId
      });

      if (!olderMessages || olderMessages.length === 0) {
        logger.info('[TelegramChatView] No more older messages found');
        setHasMoreMessages(false);
        return;
      }

      logger.info(`[TelegramChatView] Loaded ${olderMessages.length} older messages`);

      // Fetch parent events for replies
      await fetchParentEvents(olderMessages);

      // Merge with existing messages, avoiding duplicates
      const existingIds = new Set(messages.map(msg => msg.id));
      const newMessages = olderMessages.filter(msg => !existingIds.has(msg.id));

      if (newMessages.length === 0) {
        logger.info('[TelegramChatView] No new messages found');
        setHasMoreMessages(false);
        return;
      }

      logger.info(`[TelegramChatView] Adding ${newMessages.length} new older messages`);

      // Update messages state
      setMessages(prevMessages => {
        const combinedMessages = [...newMessages, ...prevMessages];
        // Sort by timestamp
        return combinedMessages.sort((a, b) => a.timestamp - b.timestamp);
      });

      // Update oldest event ID
      const oldestNewMessage = [...newMessages].sort((a, b) => a.timestamp - b.timestamp)[0];
      if (oldestNewMessage && oldestNewMessage.id) {
        setOldestEventId(oldestNewMessage.id);
      }

      // Determine if there might be more messages
      setHasMoreMessages(newMessages.length >= 50);
    } catch (error) {
      logger.error('[TelegramChatView] Error loading more messages:', error);
      toast.error('Failed to load more messages');
    } finally {
      setLoadingMore(false);
    }
  };

  // Note: We're now using MatrixMessageLoader for real-time updates
  // Keeping this function for reference
  const handleRoomTimelineEvent = async (event, room) => {
    // Only process events for the selected room
    if (!room || room.roomId !== selectedContact?.id) return;

    logger.info(`[TelegramChatView] Received new timeline event for room ${room.roomId}`);

    try {
      // Reload messages using MatrixTimelineManager
      const updatedMessages = await matrixTimelineManager.loadMessages(room.roomId, {
        limit: 100,
        direction: 'b'
      });

      if (updatedMessages && updatedMessages.length > 0) {
        setMessages(updatedMessages);
      }
    } catch (error) {
      logger.warn(`[TelegramChatView] Error handling timeline event:`, error);
    }
  };

  // Note: We're using the comprehensive message loading approach instead of RoomListManager

  // Note: We're now using MatrixMessageLoader for message loading
  // Keeping this function for reference only - DO NOT USE
  const loadMessagesDirectly = async () => {
    try {
      const room = client.getRoom(selectedContact.id);
      if (!room) {
        logger.warn('[TelegramChatView] Room not found, showing welcome message');
        showWelcomeMessages();
        return;
      }

      const timeline = room.getLiveTimeline();
      if (!timeline) {
        logger.warn('[TelegramChatView] No timeline found for room, showing welcome message');
        showWelcomeMessages();
        return;
      }

      // Get events from the current timeline
      let events = timeline.getEvents();
      logger.info(`[TelegramChatView] Initial timeline has ${events.length} events`);

      // Try multiple strategies to load more events
      events = await loadMoreEvents(room, timeline, events);
      logger.info(`[TelegramChatView] Final event count: ${events.length} events`);

      // Process events to extract messages
      const directMessages = processEvents(events);

      if (directMessages.length > 0) {
        logger.info(`[TelegramChatView] Converted ${directMessages.length} events to messages`);
        setMessages(directMessages);
      } else {
        logger.warn('[TelegramChatView] No message events found in timeline, showing welcome message');
        showWelcomeMessages();
      }
    } catch (directLoadError) {
      logger.error('[TelegramChatView] Error loading messages directly:', directLoadError);
      showWelcomeMessages('Unable to load messages. Please try again later.');
    }
  };

  // Note: This function is no longer used as we're using the comprehensive message loading approach
  // Keeping it for reference
  const loadMoreEvents = async (room, timeline, initialEvents) => {
    let events = [...initialEvents];

    // If we have very few events, try to load more from the room's history
    if (events.length < 10) {
      try {
        logger.info('[TelegramChatView] Attempting to load more events from room history');

        // Try to use scrollback to get more events
        let timelineEvents = [];

        if (window.matrixcs && window.matrixcs.TimelineWindow) {
          const timelineWindow = new window.matrixcs.TimelineWindow(client, timeline);
          // First parameter should be a direction ('b' for backwards), second is the number of events
          await timelineWindow.paginate('b', 50); // Try to load 50 earlier events

          // Get all events from the timeline window
          for (let i = 0; i < timelineWindow.getEvents().length; i++) {
            timelineEvents.push(timelineWindow.getEvents()[i]);
          }

          if (timelineEvents.length > events.length) {
            logger.info(`[TelegramChatView] Loaded ${timelineEvents.length} events from timeline window`);
            events = timelineEvents;
          }
        } else {
          // Try to use the timeline's pagination method directly
          logger.info('[TelegramChatView] TimelineWindow not available, trying direct pagination');

          try {
            // Try to paginate the timeline directly
            const paginationResult = await client.paginateEventTimeline(timeline, { backwards: true, limit: 50 });
            if (paginationResult) {
              const newEvents = timeline.getEvents();
              logger.info(`[TelegramChatView] Paginated timeline directly, now has ${newEvents.length} events`);
              events = newEvents;
            }
          } catch (paginationError) {
            logger.warn('[TelegramChatView] Error paginating timeline directly:', paginationError);
          }
        }
      } catch (timelineError) {
        logger.warn('[TelegramChatView] Error loading more events from timeline window:', timelineError);

        // Try another approach - request context around the latest event
        try {
          const latestEvent = events[events.length - 1];
          if (latestEvent && latestEvent.getId) {
            const eventId = latestEvent.getId();
            logger.info(`[TelegramChatView] Requesting context around event ${eventId}`);

            // Request context around this event
            if (client.relations) {
              const contextResponse = await client.relations(selectedContact.id, eventId, null, null, { limit: 50 });
              if (contextResponse && contextResponse.events && contextResponse.events.length > 0) {
                logger.info(`[TelegramChatView] Loaded ${contextResponse.events.length} events from context`);
                events = contextResponse.events;
              }
            } else if (client.getEventTimeline) {
              // Try to get the event timeline
              const eventTimeline = await client.getEventTimeline(room.getUnfilteredTimelineSet(), eventId);
              if (eventTimeline) {
                const timelineEvents = eventTimeline.getEvents();
                logger.info(`[TelegramChatView] Loaded ${timelineEvents.length} events from event timeline`);
                if (timelineEvents.length > events.length) {
                  events = timelineEvents;
                }
              }
            }
          }
        } catch (contextError) {
          logger.warn('[TelegramChatView] Error loading context around event:', contextError);
        }
      }
    }

    // As a last resort, try to fetch messages directly from the server
    if (events.length < 5) {
      try {
        logger.info('[TelegramChatView] Attempting to fetch messages directly from server');

        if (client.roomMessages) {
          try {
            // Use a try-catch block specifically for roomMessages
            // Use 'b' (backwards) to get historical messages
            const messageResponse = await client.roomMessages(selectedContact.id, null, 100, 'b');

            if (messageResponse && messageResponse.chunk && messageResponse.chunk.length > 0) {
              logger.info(`[TelegramChatView] Loaded ${messageResponse.chunk.length} messages from server`);

              // Process the events to ensure they're in the right format
              const processedEvents = messageResponse.chunk.map(event => {
                // Add isLiveEvent function if it doesn't exist
                if (typeof event.isLiveEvent !== 'function') {
                  event.isLiveEvent = () => false;
                }
                return event;
              });

              // Store the original events for reference
              const originalEvents = [...events];

              // Merge with existing events, avoiding duplicates
              const existingEventIds = new Set(events.map(e => {
                if (typeof e.getId === 'function') return e.getId();
                return e.event_id || e.id;
              }).filter(Boolean));

              const newEvents = processedEvents.filter(e => {
                const eventId = typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
                return eventId && !existingEventIds.has(eventId);
              });

              logger.info(`[TelegramChatView] Adding ${newEvents.length} new events from server`);
              events = [...originalEvents, ...newEvents];
            }
          } catch (roomMessagesError) {
            logger.warn(`[TelegramChatView] Error in roomMessages:`, roomMessagesError);
            // Try an alternative approach - get the last 50 events from the timeline
            try {
              const timelineSet = room.getUnfilteredTimelineSet();
              const liveTimeline = timelineSet.getLiveTimeline();
              const timelineEvents = liveTimeline.getEvents();

              if (timelineEvents.length > 0) {
                logger.info(`[TelegramChatView] Using ${timelineEvents.length} events from live timeline`);
                events = timelineEvents;
              }
            } catch (timelineError) {
              logger.warn(`[TelegramChatView] Error getting timeline events:`, timelineError);
            }
          }
        } else if (client.scrollback && room) {
          // Try using the scrollback method if available
          const scrollbackEvents = await client.scrollback(room, 50);
          if (scrollbackEvents && scrollbackEvents.length > 0) {
            logger.info(`[TelegramChatView] Loaded ${scrollbackEvents.length} events from scrollback`);
            events = scrollbackEvents;
          }
        } else {
          logger.warn('[TelegramChatView] No suitable method available to fetch messages from server');
        }
      } catch (messageError) {
        logger.warn('[TelegramChatView] Error fetching messages from server:', messageError);
      }
    }

    return events;
  };

  // Helper function to process a single message event
  const processMessageEvent = (event, messagesArray) => {
    try {
      // Get event ID
      let id = null;
      if (typeof event.getId === 'function') {
        id = event.getId();
      } else if (event.event_id) {
        id = event.event_id;
      } else if (event.id) {
        id = event.id;
      } else {
        id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }

      // Get sender
      let sender = null;
      if (typeof event.getSender === 'function') {
        sender = event.getSender();
      } else if (event.sender) {
        sender = event.sender;
      } else if (event.user_id) {
        sender = event.user_id;
      } else {
        sender = 'Unknown';
      }

      // Get content
      let content = null;
      if (typeof event.getContent === 'function') {
        content = event.getContent();
      } else if (event.content) {
        content = event.content;
      } else if (event.event && event.event.content) {
        content = event.event.content;
      } else if (typeof event.get === 'function' && event.get('content')) {
        content = event.get('content');
      } else {
        content = { body: 'Message content unavailable' };
      }

      // If content doesn't have a body but has formatted_body, use that
      if (content && !content.body && content.formatted_body) {
        content.body = content.formatted_body.replace(/<[^>]*>/g, '');
      }

      // If content is empty or doesn't have a body, skip this message
      if (!content || (!content.body && !content.text)) {
        return false;
      }

      // Get timestamp
      let timestamp = null;
      if (typeof event.getOriginServerTs === 'function') {
        timestamp = event.getOriginServerTs();
      } else if (event.origin_server_ts) {
        timestamp = event.origin_server_ts;
      } else if (event.timestamp) {
        timestamp = event.timestamp;
      } else {
        timestamp = Date.now();
      }

      // Check if message is from current user
      const isFromMe = sender === client.getUserId();

      // Add to messages array
      messagesArray.push({
        id,
        sender,
        content,
        timestamp,
        isFromMe
      });

      return true;
    } catch (error) {
      logger.warn(`[TelegramChatView] Error processing message event:`, error);
      return false;
    }
  };

  // Note: This function is no longer used as we're using the comprehensive message loading approach
  // Keeping it for reference
  const processEvents = async (events) => {
    const directMessages = [];

    // Log the raw events for debugging
    logger.info(`[TelegramChatView] Processing ${events.length} events, first event:`,
      events.length > 0 ? JSON.stringify(events[0]).substring(0, 200) + '...' : 'none');

    for (let i = 0; i < events.length; i++) {
      try {
        const event = events[i];

        // Skip null or undefined events
        if (!event) continue;

        // Check if it's a message event
        let eventType = null;

        // Try different ways to get the event type
        if (typeof event.getType === 'function') {
          eventType = event.getType();
        } else if (event.type) {
          eventType = event.type;
        } else if (typeof event.get === 'function' && event.get('type')) {
          eventType = event.get('type');
        } else if (event.event && event.event.type) {
          eventType = event.event.type;
        } else if (event.content && event.content.msgtype) {
          eventType = 'm.room.message';
        } else if (event.event && event.event.content && event.event.content.msgtype) {
          eventType = 'm.room.message';
        }

        // Process message events
        if (eventType === 'm.room.message') {
          // Process the message event
          processMessageEvent(event, directMessages);
        }
        // Process reaction events
        else if (eventType === 'm.reaction') {
          // Get the event that this reaction refers to
          let relatedEventId = null;

          if (event.content && event.content['m.relates_to'] && event.content['m.relates_to'].event_id) {
            relatedEventId = event.content['m.relates_to'].event_id;
            logger.info(`[TelegramChatView] Found reaction to event ${relatedEventId}`);

            // Look for the related event in our events array
            const relatedEvent = events.find(e => {
              const eId = typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
              return eId === relatedEventId;
            });

            if (relatedEvent) {
              logger.info(`[TelegramChatView] Found related event for reaction`);
              // Process the related event as a message
              processMessageEvent(relatedEvent, directMessages);
            } else {
              logger.warn(`[TelegramChatView] Could not find related event ${relatedEventId} for reaction`);
              // Try to fetch the related event
              try {
                if (client.getEvent) {
                  const fetchedEvent = await client.getEvent(selectedContact.id, relatedEventId);
                  if (fetchedEvent) {
                    logger.info(`[TelegramChatView] Fetched related event ${relatedEventId}`);
                    processMessageEvent(fetchedEvent, directMessages);
                  }
                }
              } catch (fetchError) {
                logger.warn(`[TelegramChatView] Error fetching related event:`, fetchError);
              }
            }
          }
        }
        // Skip other event types
        else {
          logger.info(`[TelegramChatView] Skipping event of type ${eventType}`);
        }
      } catch (eventError) {
        logger.warn(`[TelegramChatView] Error processing event:`, eventError);
        // Continue with next event
      }
    }

    logger.info(`[TelegramChatView] Processed ${directMessages.length} valid message events out of ${events.length} total events`);
    return directMessages;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !selectedContact || !client || sending) return;

    setSending(true);
    try {
      logger.info(`[TelegramChatView] Sending message to ${selectedContact.name}`);

      // Initialize MatrixTimelineManager if not already initialized
      if (!matrixTimelineManager.initialized) {
        logger.info('[TelegramChatView] Initializing MatrixTimelineManager for sending message');
        try {
          const initialized = matrixTimelineManager.initialize(client);

          if (!initialized) {
            throw new Error('Failed to initialize MatrixTimelineManager');
          }
        } catch (error) {
          logger.error('[TelegramChatView] Error initializing MatrixTimelineManager:', error);
          throw new Error('Failed to initialize MatrixTimelineManager');
        }
      }

      // Prepare message content
      let messageContent = inputMessage;

      // If replying to a message, add reply information
      if (replyToEvent) {
        logger.info(`[TelegramChatView] Sending reply to event ${replyToEvent.getId()}`);

        // Create content object with reply information
        const content = {
          msgtype: 'm.text',
          body: inputMessage
        };

        // Add reply relation
        addReplyToMessageContent(content, replyToEvent);

        // Send message with reply information
        await matrixTimelineManager.sendMessage(selectedContact.id, content);
      } else {
        // Send regular message
        await matrixTimelineManager.sendMessage(selectedContact.id, messageContent);
      }

      // Clear input and reply state
      setInputMessage('');
      setReplyToEvent(null);

      // No need to reload messages as real-time updates will handle it
      // But we can force a refresh to ensure we get the latest messages
      setTimeout(() => {
        loadMessages();
      }, 500);
    } catch (err) {
      logger.error('[TelegramChatView] Error sending message:', err);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Handle starting a reply to a message
  const handleReplyToMessage = (message) => {
    if (!message || !message.rawEvent) return;

    logger.info(`[TelegramChatView] Setting up reply to message: ${message.id}`);
    setReplyToEvent(message.rawEvent);
  };

  // Handle canceling a reply
  const handleCancelReply = () => {
    setReplyToEvent(null);
  };

  // Show message if no contact is selected
  if (!selectedContact) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-neutral-900 to-neutral-950 text-white">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center p-8 max-w-md bg-neutral-800/30 rounded-xl border border-white/5 shadow-lg">
            <div className="w-20 h-20 rounded-full bg-[#0088cc]/10 flex items-center justify-center mx-auto mb-6">
              <FiMessageCircle className="text-[#0088cc] text-4xl" />
            </div>
            <h3 className="text-2xl font-medium text-white mb-3">Select a conversation</h3>
            <p className="text-gray-400 mb-6">Choose a contact from the list to start chatting</p>
            <div className="flex justify-center space-x-2 text-xs text-gray-500">
              <span className="px-2 py-1 bg-neutral-800 rounded-full">Telegram</span>
              <span className="px-2 py-1 bg-neutral-800 rounded-full">Matrix</span>
              <span className="px-2 py-1 bg-neutral-800 rounded-full">End-to-End Encrypted</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading if client is not available
  if (clientLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-b from-neutral-900 to-neutral-950 p-6">
        <div className="text-center bg-neutral-800/30 p-8 rounded-xl border border-white/5 shadow-lg max-w-md">
          <div className="w-16 h-16 border-4 border-t-[#0088cc] border-r-transparent border-b-[#0088cc]/30 border-l-[#0088cc]/60 rounded-full animate-spin mx-auto mb-6"></div>
          <h3 className="text-xl font-medium text-white mb-3">Connecting to Matrix</h3>
          <p className="text-gray-400 mb-4">Please wait while we establish a connection...</p>
          <div className="w-full bg-neutral-700/30 h-1.5 rounded-full overflow-hidden">
            <div className="h-full bg-[#0088cc] rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // Show confirmation UI if needed
  if (needsConfirmation) {
    return (
      <ChatConfirmation
        contact={selectedContact}
        onConfirm={handleConfirmViewChat}
        isJoining={isJoining}
        error={joinError}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900 relative">
      {/* Room Members Panel */}
      {showMemberList && (
        <div className="absolute inset-0 z-20">
          <RoomMemberList
            roomId={selectedContact.id}
            onClose={() => setShowMemberList(false)}
          />
        </div>
      )}
      {/* Chat header */}
      <div className="py-3 px-4 border-b border-white/10 bg-neutral-900 flex items-center sticky top-0 z-10 shadow-sm">
        <div className="mr-3 relative">
          {selectedContact.avatar ? (
            <img
              src={selectedContact.avatar}
              alt={selectedContact.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-transparent hover:border-[#0088cc] transition-colors"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0088cc] to-[#0077b6] flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200">
              {selectedContact.isGroup ? (
                <FiUsers className="text-white" />
              ) : (
                <FiUser className="text-white" />
              )}
            </div>
          )}
          <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-neutral-900"></div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white truncate text-base">{selectedContact.name}</h3>
          <p className="text-xs text-gray-400 truncate flex items-center">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>
            {selectedContact.isGroup
              ? `${selectedContact.members || 'Multiple'} members`
              : 'Online now'}
          </p>
        </div>

        <div className="flex space-x-2">
          {/* Refresh button */}
          <button
            onClick={async () => {
              setMessages([]);
              setLoading(true);
              await loadMessages();
              setLoading(false);
            }}
            className="p-2 bg-[#0088CC] text-gray-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
            title="Refresh messages"
            disabled={loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>

          {/* Room members button */}
          <button
            onClick={() => setShowMemberList(true)}
            className="p-2 bg-[#0088CC] text-gray-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
            title="View room members"
          >
            <FiUsers className="w-4 h-4" />
          </button>

          {/* Call button */}
          <button
            className="p-2 bg-[#0088CC] text-gray-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
            title="Call"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>

          {/* Menu button */}
          <button
            className="p-2 bg-[#0088CC] text-gray-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
            title="More options"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="19" cy="12" r="1"></circle>
              <circle cx="5" cy="12" r="1"></circle>
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-neutral-900 to-neutral-950">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-10 h-10 border-4 border-t-[#0088cc] border-r-transparent border-b-[#0088cc]/30 border-l-[#0088cc]/60 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-400 animate-pulse">Loading messages...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-neutral-800/50 p-6 rounded-xl shadow-lg max-w-md mx-auto border border-red-500/20">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <FiMessageCircle className="text-red-500 text-2xl" />
              </div>
              <h3 className="text-white font-medium text-lg mb-2">Unable to load messages</h3>
              <p className="text-gray-400 mb-4 text-sm">{error}</p>
              <button
                onClick={loadMessages}
                className="px-4 py-2 bg-[#0088cc] text-white rounded-lg hover:bg-[#0077b6] transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center bg-neutral-800/50 p-8 rounded-xl max-w-md mx-auto border border-[#0088cc]/10">
              <div className="w-16 h-16 rounded-full bg-[#0088cc]/10 flex items-center justify-center mx-auto mb-4">
                <FiMessageCircle className="text-[#0088cc] text-2xl" />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">No messages yet</h3>
              <p className="text-gray-400 mb-4">Start the conversation by sending a message</p>
              <div className="text-xs text-gray-500 mt-4 flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></div>
                <span>{selectedContact.name} is online</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Load More Messages button */}
            {hasMoreMessages && (
              <div className="flex justify-center py-3">
                <button
                  onClick={loadMoreMessages}
                  disabled={loadingMore}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                      <span>Loading...</span>
                    </>
                  ) : (
                    <span>Load More Messages</span>
                  )}
                </button>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={message.id || index}
                className={`flex items-end ${message.isFromMe ? 'justify-end' : 'justify-start'} mb-4 group`}
              >
                {/* Avatar for received messages */}
                {!message.isFromMe && (
                  <div className="flex-shrink-0 mr-2 mb-1">
                    {message.sender && message.sender.includes('telegram_') && message.content && message.content.sender_avatar ? (
                      // If we have a sender avatar URL, use it
                      <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-transparent hover:border-[#0088cc] transition-colors">
                        <img
                          src={message.content.sender_avatar && client ?
                            getMediaUrl(client, message.content.sender_avatar, {
                              type: 'thumbnail',
                              width: 80,
                              height: 80,
                              method: 'crop',
                              fallbackUrl: getFallbackAvatarUrl(message.senderName || 'T', '#0088cc')
                            }) :
                            getFallbackAvatarUrl(message.senderName || 'T', '#0088cc')
                          }
                          alt="Avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // If image fails to load, show a fallback
                            e.target.parentNode.innerHTML = `<div class="w-8 h-8 rounded-full bg-gradient-to-br from-[#0088cc] to-[#0077b6] flex items-center justify-center shadow-md">${
                              message.senderName ? message.senderName.charAt(0).toUpperCase() : 'T'
                            }</div>`;
                          }}
                        />
                      </div>
                    ) : (
                      // Otherwise, show the default avatar with initial
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0088cc] to-[#0077b6] flex items-center justify-center text-sm font-medium text-white overflow-hidden shadow-md">
                        {(() => {
                          // First check if we have a senderName in the message
                          if (message.senderName) {
                            return message.senderName.charAt(0).toUpperCase();
                          }

                          // Try to get the first letter of the sender's name
                          if (message.sender && client) {
                            const roomId = selectedContact.id;
                            const room = client.getRoom(roomId);

                            if (room) {
                              const member = room.getMember(message.sender);
                              if (member && member.name) {
                                return member.name.charAt(0).toUpperCase();
                              }
                            }

                            // For Telegram users, try to get a better initial
                            if (message.sender.includes('telegram_')) {
                              // Try to get the name from the message content
                              if (message.content && message.content.sender_name) {
                                return message.content.sender_name.charAt(0).toUpperCase();
                              }

                              // If we have a Telegram ID, use 'T'
                              return 'T';
                            }

                            // Fallback to first character of Matrix ID
                            return message.sender.charAt(0).toUpperCase();
                          }
                          return '?';
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Reply button */}
                <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-12 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleReplyToMessage(message)}
                    className="p-2 bg-[#0088cc]/80 rounded-full hover:bg-[#0088cc] transition-colors text-white shadow-lg"
                    title="Reply to this message"
                  >
                    <FiCornerUpLeft size={16} />
                  </button>
                </div>

                {/* Message bubble */}
                <div
                  className={`max-w-[75%] rounded-2xl p-3 shadow-sm transition-all duration-200 ${
                    message.isFromMe
                      ? 'bg-gradient-to-br from-[#0088cc] to-[#0077b6] text-white rounded-tr-none'
                      : 'bg-neutral-800 text-white rounded-tl-none'
                  } hover:shadow-md`}
                >
                  {/* Sender name */}
                  {!message.isFromMe && (
                    <div className="text-xs font-medium text-blue-300 mb-1">
                      {(() => {
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
                              // First check if we already have a display name in the message
                              if (message.senderName && message.senderName !== message.sender) {
                                return message.senderName;
                              }

                              // Look for a display name in the room state
                              const room = client.getRoom(selectedContact.id);
                              if (room && room.currentState) {
                                const stateEvents = room.currentState.getStateEvents('m.room.member');
                                for (const event of stateEvents) {
                                  const content = event.getContent();
                                  const userId = event.getStateKey();
                                  if (userId === message.sender && content.displayname) {
                                    return content.displayname;
                                  }
                                }
                              }

                              // Try to get the name from the message content
                              if (message.content && message.content.sender_name) {
                                return message.content.sender_name;
                              }

                              // If we still don't have a name, use the Telegram ID
                              return `Telegram User ${telegramId[1]}`;
                            }
                          }

                          // For other users, just use the first part of the Matrix ID
                          return message.sender.split(':')[0].replace('@', '');
                        }
                        return 'Unknown';
                      })()}
                    </div>
                  )}

                  {/* Reply preview if this message is a reply */}
                  {message.rawEvent && getParentEventId(message.rawEvent) && parentEvents[getParentEventId(message.rawEvent)] && (
                    <MessageReply
                      replyToEvent={parentEvents[getParentEventId(message.rawEvent)]}
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
                                        thumbUrl = client.mxcUrlToHttp(thumbUrl);
                                      }
                                      e.target.src = thumbUrl;
                                    } else {
                                      // If no thumbnail, show a placeholder
                                      e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzMzMzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjI0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZmlsbD0id2hpdGUiPkltYWdlIHVuYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==';
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

                        // Handle file messages
                        if (message.content.msgtype === 'm.file') {
                          // Get the file URL
                          let fileUrl = message.content.url;

                          // Handle mxc:// URLs
                          if (fileUrl && fileUrl.startsWith('mxc://') && client) {
                            try {
                              // Extract the server name and media ID from the mxc URL
                              // Format: mxc://<server-name>/<media-id>
                              const [, serverName, mediaId] = fileUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/) || [];

                              if (serverName && mediaId) {
                                // Use the correct Matrix media API endpoint for files
                                const accessToken = client.getAccessToken();
                                fileUrl = `${client.baseUrl}/_matrix/media/r0/download/${serverName}/${mediaId}?access_token=${encodeURIComponent(accessToken)}`;
                              } else {
                                // Fallback to the SDK's method
                                fileUrl = client.mxcUrlToHttp(fileUrl);
                              }
                            } catch (error) {
                              console.error('Error parsing file mxc URL:', error);
                              // Fallback to the SDK's method
                              fileUrl = client.mxcUrlToHttp(fileUrl);
                            }
                          }

                          if (fileUrl) {
                            return (
                              <div className="flex items-center mt-1 bg-neutral-800/50 p-2 rounded-md">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div>
                                  <div className="text-sm">{message.content.body || 'File'}</div>
                                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">Download</a>
                                  {message.content.info && message.content.info.size && (
                                    <span className="text-xs text-gray-400 ml-2">
                                      {Math.round(message.content.info.size / 1024)} KB
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        }

                        // Handle video messages
                        if (message.content.msgtype === 'm.video') {
                          // Get the video URL
                          let videoUrl = message.content.url;

                          // Handle mxc:// URLs
                          if (videoUrl && videoUrl.startsWith('mxc://') && client) {
                            // Use our media utility to get the URL with proper caching and error handling
                            videoUrl = getMediaUrl(client, videoUrl, {
                              type: 'download',
                              fallbackUrl: '/images/video-placeholder.png'
                            });
                          }

                          if (videoUrl) {
                            return (
                              <div className="mt-1">
                                <video
                                  controls
                                  className="max-w-full rounded-md max-h-[200px] bg-neutral-950/50"
                                  poster={message.content.info?.thumbnail_url && client ?
                                    getMediaUrl(client, message.content.info.thumbnail_url, {
                                      type: 'thumbnail',
                                      width: 800,
                                      height: 600,
                                      method: 'scale',
                                      fallbackUrl: '/images/video-placeholder.png'
                                    }) :
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

                        // Handle audio messages
                        if (message.content.msgtype === 'm.audio') {
                          // Get the audio URL
                          let audioUrl = message.content.url;

                          // Handle mxc:// URLs
                          if (audioUrl && audioUrl.startsWith('mxc://') && client) {
                            try {
                              // Extract the server name and media ID from the mxc URL
                              // Format: mxc://<server-name>/<media-id>
                              const [, serverName, mediaId] = audioUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/) || [];

                              if (serverName && mediaId) {
                                // Use the correct Matrix media API endpoint for audio
                                const accessToken = client.getAccessToken();
                                audioUrl = `${client.baseUrl}/_matrix/media/r0/download/${serverName}/${mediaId}?access_token=${encodeURIComponent(accessToken)}`;
                              } else {
                                // Fallback to the SDK's method
                                audioUrl = client.mxcUrlToHttp(audioUrl);
                              }
                            } catch (error) {
                              console.error('Error parsing audio mxc URL:', error);
                              // Fallback to the SDK's method
                              audioUrl = client.mxcUrlToHttp(audioUrl);
                            }
                          }

                          if (audioUrl) {
                            return (
                              <div className="mt-1 bg-neutral-800/50 p-2 rounded-md">
                                <div className="flex items-center mb-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                  </svg>
                                  <div className="text-sm">{message.content.body || 'Audio'}</div>
                                </div>
                                <audio controls className="w-full">
                                  <source src={audioUrl} type={message.content.info?.mimetype || 'audio/mpeg'} />
                                  Your browser does not support the audio element.
                                </audio>
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
                      message.isFromMe ? 'text-blue-200' : 'text-gray-400'
                    } text-right flex items-center justify-end`}
                  >
                    <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {/* Avatar for sent messages */}
                {message.isFromMe && (
                  <div className="flex-shrink-0 ml-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-[#0088cc] flex items-center justify-center text-sm font-medium text-white overflow-hidden shadow-md">
                      {client?.getUserId() ? client.getUserId().charAt(0).toUpperCase() : 'Me'}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message input */}
      <div className="p-3 border-t border-white/10 bg-neutral-900">
        {/* Reply preview */}
        {replyToEvent && (
          <ReplyPreview
            replyToEvent={replyToEvent}
            onCancelReply={handleCancelReply}
            client={client}
          />
        )}
        {/* Attachment options */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex space-x-3">
            <button
              type="button"
              className="text-gray-400 bg-neutral-800 hover:text-[#0088cc] transition-colors p-1 rounded-full hover:bg-neutral-800"
              title="Attach files"
            >
              <FiPaperclip className="w-5 h-5" />
            </button>
            <button
              type="button"
              className="text-gray-400 bg-neutral-800 hover:text-[#0088cc] transition-colors p-1 rounded-full hover:bg-neutral-800"
              title="Send images"
            >
              <FiImage className="w-5 h-5" />
            </button>
          </div>
          <div>
            <button
              type="button"
              className="text-gray-400 bg-neutral-800 hover:text-[#0088cc] transition-colors p-1 rounded-full hover:bg-neutral-800"
              title="Format text"
            >
              <span className="font-bold text-sm">Aa</span>
            </button>
          </div>
        </div>

        {/* Message composer */}
        <form onSubmit={handleSendMessage} className="flex items-center">
          <div className="relative flex-1 items-center">
            <div className="absolute bottom-2 left-2">
              <button
                type="button"
                className="text-gray-400 bg-neutral-800 hover:text-[#0088cc] transition-colors p-1 rounded-full hover:bg-neutral-800"
                title="Add emoji"
              >
                <FiSmile className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              rows={1}
              className="w-full bg-neutral-800 text-white rounded-2xl pl-10 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#0088cc] resize-none min-h-[44px] max-h-[120px] overflow-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#555 #333' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (inputMessage.trim()) {
                    handleSendMessage(e);
                  }
                }
              }}
            />
            <div className="absolute bottom-2 right-2">
              <button
                type="button"
                className="text-gray-400 bg-neutral-800 hover:text-[#0088cc] transition-colors p-1 rounded-full hover:bg-neutral-800"
                title="Voice message"
              >
                <FiMic className="w-5 h-5" />
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={!inputMessage.trim() || sending}
            className={`p-3 w-auto rounded-full ml-2 flex-shrink-0 transition-all duration-200 ${
              inputMessage.trim() && !sending
                ? 'bg-[#0088cc] text-white shadow-md hover:bg-[#0077b6]'
                : 'bg-neutral-800 text-gray-400'
            }`}
            title="Send message"
          >
            <FiSend className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default TelegramChatView;
