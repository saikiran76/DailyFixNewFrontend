import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiSend, FiMessageCircle, FiUser, FiUsers, FiPaperclip, FiImage, FiSmile, FiMic, FiHelpCircle } from 'react-icons/fi';
import AIAssistantButton from './AIAssistantButton';
import AIFeatureTour from './AIFeatureTour';
import AIActionButtons from './TelegramAI/AIActionButtons';
import '../styles/messageBubbles.css';
import { useMatrixClient } from '../context/MatrixClientContext';
import { toast } from 'react-hot-toast';
import matrixTimelineManager from '../utils/matrixTimelineManager';
import logger from '../utils/logger';
import ChatConfirmation from './ChatConfirmation';
import RoomMemberList from './RoomMemberList';
import ReplyPreview from './ReplyPreview';
import MessageReply from './MessageReply';
import MessageBubbleWithWheel from './MessageBubbleWithWheel';
import DateSeparator from './DateSeparator';
import { getParentEventId, addReplyToMessageContent } from '../utils/replyUtils';
import { getMediaUrl, getFallbackAvatarUrl } from '../utils/mediaUtils';
import '../styles/messageActionWheel.css';
import '../styles/dateSeparator.css';
import PropTypes from 'prop-types';

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
  const directTimelineListenerRef = useRef(null); // Ref to hold the listener function instance
  const processedEventIdsRef = useRef(new Set());
  const activeTimelineListenerRef = useRef(null);
  const listenerAttachedToRoomIdRef = useRef(null);
  const syncHandlerRef = useRef(null);
  const eventCounterRef = useRef(0);
  const lastMessageTimestampRef = useRef(Date.now());
  const timelineUpdateHandlerRef = useRef(null);
  const userHasScrolled = useRef(false);

  // CRITICAL FIX: Moved these state declarations to the top
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  // Confirmation and room joining states
  const [needsConfirmation, setNeedsConfirmation] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  // Room members panel state
  const [showMemberList, setShowMemberList] = useState(false);

  // AI Feature Tour state
  const [showAITour, setShowAITour] = useState(false);

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

  // --- NEW useEffect Hook dedicated to Room.timeline listener ---
  useEffect(() => {
    // Only run if we have a client and a selected contact ID and confirmation is not needed
    if (!client || !selectedContact?.id || needsConfirmation) {
      // Ensure listener is removed if dependencies change while listener is active
      if (directTimelineListenerRef.current) {
         try {
            client?.removeListener('Room.timeline', directTimelineListenerRef.current);
            logger.info(`[TelegramChatView] Removed previous 'Room.timeline' listener due to dependency change.`);
            directTimelineListenerRef.current = null;
         } catch (e) { logger.warn('Error removing listener on dep change', e); }
      }
      return;
    }

    const currentRoomId = selectedContact.id;
    logger.info(`[TelegramChatView] Setting up 'Room.timeline' listener via dedicated useEffect for room: ${currentRoomId}`);
    logger.info(`[TelegramChatView] Client sync state at listener attach: ${client?.getSyncState()}`);

    // --- Define the listener function INSIDE the hook ---
    directTimelineListenerRef.current = (event, room, toStartOfTimeline, removed) => {
      // --- START Listener function body ---
      if (toStartOfTimeline || removed) return; // Ignore historical/removed

      const eventId = event?.getId?.();
      if (!eventId) {
        logger.warn('[TelegramChatView] Event has no ID, cannot process.');
        return;
      }

      // Check Room ID robustly
      let eventRoomId = room?.roomId || room?.room_id || event?.getRoomId?.();
      if (!eventRoomId && room?.id && client) {
          const actualRoom = client.getRoom(room.id);
          if (actualRoom) eventRoomId = actualRoom.roomId;
      }

      // Ensure event is for the correct room
      if (eventRoomId !== currentRoomId) {
        return; // Ignore events for other rooms
      }

      // --- Deduplication ---
      if (processedEventIdsRef.current.has(eventId)) {
        logger.debug(`[TelegramChatView] Event ${eventId} already processed, skipping.`);
        return;
      }
      processedEventIdsRef.current.add(eventId);
      setTimeout(() => {
        processedEventIdsRef.current.delete(eventId);
      }, 5 * 60 * 1000); // Cleanup after 5 minutes
      // --- End Deduplication ---

      logger.info(`[TelegramChatView] ✅ Processing 'Room.timeline' event for ${currentRoomId}. ID: ${eventId}`);

      // --- Process the Message ---
      try {
        const currentRoomForProcessing = client.getRoom(currentRoomId); // Get fresh room object
        if (!currentRoomForProcessing) {
            logger.warn(`[TelegramChatView] Could not get room object for ${currentRoomId} during event processing.`);
            return;
        }
        const newMessage = matrixTimelineManager._createMessageFromEvent(event, currentRoomForProcessing);

        if (newMessage) {
          logger.info(`[TelegramChatView] Adding new message ${newMessage.id} from real-time event.`);
          setMessages(prevMessages => {
            if (prevMessages.some(m => m.id === newMessage.id)) {
              logger.warn(`[TelegramChatView] Message ${newMessage.id} was already in state. Skipping add.`);
              return prevMessages;
            }
            const updatedMessages = [...prevMessages, newMessage];
            return updatedMessages.sort((a, b) => a.timestamp - b.timestamp); // Keep chronological order
          });

          // Mark as read if applicable
           if (!newMessage.isFromMe) {
                try {
                    if (typeof event.getRoomId !== 'function') {
                        event.getRoomId = () => currentRoomId;
                        logger.debug(`[TelegramChatView] Patched getRoomId onto event ${eventId} for read receipt.`);
                    }
                    client.sendReadReceipt(event);
                    logger.info(`[TelegramChatView] Sent read receipt for new message ${eventId}`);
                } catch (readError) {
                    logger.warn(`[TelegramChatView] Error sending read receipt for new message ${eventId}: ${readError.message}`);
                }
            }

          // Handle scrolling
          if (!userHasScrolled.current) {
            setShouldScrollToBottom(true);
          }
          lastMessageTimestampRef.current = Date.now(); // Update timestamp for forced refresh logic
        } else {
          logger.warn(`[TelegramChatView] Could not create message from event ${eventId}`);
        }
      } catch (e) {
        logger.error(`[TelegramChatView] Error processing event ${eventId} into message:`, e);
      }
      // --- End Process Message ---
      // --- END Listener function body ---
    };
    // --- End Define Listener ---

    // --- Attach the listener ---
    if (typeof directTimelineListenerRef.current === 'function') {
        client.on('Room.timeline', directTimelineListenerRef.current);
        logger.info(`[TelegramChatView] Attached 'Room.timeline' listener for ${currentRoomId}`);
    } else {
       logger.error("[TelegramChatView] Listener function was not defined correctly when attaching.");
    }
    // --- End Attach Listener ---

    // --- Return cleanup function ---
    return () => {
        if (client && typeof directTimelineListenerRef.current === 'function') {
            client.removeListener('Room.timeline', directTimelineListenerRef.current);
            logger.info(`[TelegramChatView] Removed 'Room.timeline' listener for ${currentRoomId}`);
        } else {
            logger.warn(`[TelegramChatView] Could not remove 'Room.timeline' listener on cleanup for ${currentRoomId}. Client or listener invalid.`);
        }
        directTimelineListenerRef.current = null; // Clear the ref
    };
    // --- End Cleanup ---

  // Dependencies: client, selectedContact.id, needsConfirmation, and userHasScrolled for scroll logic
  }, [client, selectedContact?.id, needsConfirmation, userHasScrolled]);

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

  // Forward declarations
  let setupRealTimeUpdates;

  // Fetch parent events for replies
  const fetchParentEvents = useCallback(async (messages) => {
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

      // First check if we have any of these events in our cache
      try {
        // Check if we have any cached parent events in localStorage
        const cachedParentEventsStr = localStorage.getItem(`parent_events_${roomId}`);
        if (cachedParentEventsStr) {
          const cachedParentEvents = JSON.parse(cachedParentEventsStr);
          // Filter out events we already have in cache
          eventIdsToFetch.forEach((eventId, index) => {
            if (cachedParentEvents[eventId]) {
              newParentEvents[eventId] = cachedParentEvents[eventId];
              logger.info(`[TelegramChatView] Using cached parent event: ${eventId}`);
              // Remove from the list to fetch
              eventIdsToFetch.splice(index, 1);
            }
          });
        }
      } catch (cacheError) {
        logger.warn('[TelegramChatView] Error checking cached parent events:', cacheError);
      }

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

          // If we couldn't find the event, create a fallback event
          // This prevents repeated warnings and provides a better UX
          const fallbackEvent = {
            id: eventId,
            sender: 'unknown',
            senderName: 'Unknown User',
            content: { body: 'Original message not found' },
            timestamp: Date.now(),
            getRoomId: () => roomId,
            getSender: () => 'unknown',
            getContent: () => ({ body: 'Original message not found' })
          };

          newParentEvents[eventId] = fallbackEvent;
          logger.warn(`[TelegramChatView] Created fallback for parent event: ${eventId}`);
          return { eventId, event: fallbackEvent };
        } catch (error) {
          logger.warn(`[TelegramChatView] Error fetching parent event ${eventId}:`, error);

          // Create a fallback event even on error
          const fallbackEvent = {
            id: eventId,
            sender: 'unknown',
            senderName: 'Unknown User',
            content: { body: 'Original message not found' },
            timestamp: Date.now(),
            getRoomId: () => roomId,
            getSender: () => 'unknown',
            getContent: () => ({ body: 'Original message not found' })
          };

          newParentEvents[eventId] = fallbackEvent;
          return { eventId, event: fallbackEvent };
        }
      });

      try {
        const results = await Promise.all(fetchPromises);
        const successCount = results.filter(r => r.event).length;
        logger.info(`[TelegramChatView] Fetched ${successCount} out of ${eventIdsToFetch.length} parent events`);

        // Cache the parent events for future use
        try {
          // Get existing cached events
          const existingCacheStr = localStorage.getItem(`parent_events_${roomId}`) || '{}';
          const existingCache = JSON.parse(existingCacheStr);

          // Add new events to cache
          const updatedCache = { ...existingCache, ...newParentEvents };

          // Store back in localStorage
          localStorage.setItem(`parent_events_${roomId}`, JSON.stringify(updatedCache));
          logger.info(`[TelegramChatView] Cached ${Object.keys(newParentEvents).length} parent events`);
        } catch (cacheError) {
          logger.warn('[TelegramChatView] Error caching parent events:', cacheError);
        }
      } catch (error) {
        logger.error('[TelegramChatView] Error processing parent events:', error);
      }
    }

    setParentEvents(newParentEvents);
    return newParentEvents;
  }, [client, parentEvents, selectedContact, setParentEvents]);

  // Load messages using our enhanced MatrixTimelineManager for reliable message loading
  const loadMessages = useCallback(async (forceRefresh = false) => {
    if (!selectedContact || !client) {
      logger.error('[TelegramChatView] Cannot load messages: selectedContact or client is null');
      return;
    }

    logger.info(`[TelegramChatView] Loading messages for contact: ${selectedContact.name} (${selectedContact.id})${forceRefresh ? ' (FORCE REFRESH)' : ''}`);
    setLoading(true);
    setError(null);

    // If forceRefresh is true, clear the message cache for this room
    if (forceRefresh && matrixTimelineManager.initialized) {
      try {
        matrixTimelineManager.messageCache.delete(selectedContact.id);
        logger.info(`[TelegramChatView] Cleared message cache for room ${selectedContact.id} due to force refresh`);
      } catch (error) {
        logger.warn(`[TelegramChatView] Error clearing message cache: ${error.message}`);
      }
    }

    try {
      // If the selected contact is a placeholder, show a welcome message
      if (selectedContact.isPlaceholder) {
        logger.info('[TelegramChatView] Selected contact is a placeholder, showing welcome message');
        showWelcomeMessages();
        return;
      }

      // Check if the room exists
      let room = client.getRoom(selectedContact.id);
      if (!room) {
        logger.warn(`[TelegramChatView] Room not found for ID: ${selectedContact.id}`);
        showWelcomeMessages('Room not found. Please try again later.');
        return;
      }

      // Check if we need to join the room first
      const membership = room.getMyMembership();
      logger.info(`[TelegramChatView] Room membership state: ${membership}`);

      if (membership === 'invite') {
        logger.info(`[TelegramChatView] Room is in invite state, joining automatically`);
        try {
          // Join the room using a more robust approach
          logger.info(`[TelegramChatView] Attempting to join room: ${selectedContact.id}`);

          // First try using the standard joinRoom method
          try {
            await client.joinRoom(selectedContact.id);
            logger.info(`[TelegramChatView] Successfully called joinRoom for ${selectedContact.id}`);
          } catch (initialJoinError) {
            logger.warn(`[TelegramChatView] Initial join attempt failed: ${initialJoinError.message}`);

            // If that fails, try the /join API endpoint directly
            try {
              const homeserverUrl = client.getHomeserverUrl();
              const accessToken = client.getAccessToken();

              if (homeserverUrl && accessToken) {
                logger.info(`[TelegramChatView] Trying direct API join for ${selectedContact.id}`);

                const joinUrl = `${homeserverUrl}/_matrix/client/v3/join/${encodeURIComponent(selectedContact.id)}`;
                const response = await fetch(joinUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({})
                });

                if (response.ok) {
                  logger.info(`[TelegramChatView] Direct API join successful for ${selectedContact.id}`);
                } else {
                  const errorData = await response.json();
                  throw new Error(`API join failed: ${errorData.error || response.statusText}`);
                }
              } else {
                throw new Error('Missing homeserver URL or access token');
              }
            } catch (apiJoinError) {
              logger.error(`[TelegramChatView] API join attempt also failed: ${apiJoinError.message}`);
              throw apiJoinError; // Re-throw to be caught by the outer catch
            }
          }

          // Wait for the room state to update - use a longer timeout and check multiple times
          let joinSuccessful = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            // Wait between checks
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Force a refresh of the room object
            const refreshedRoom = client.getRoom(selectedContact.id);

            if (refreshedRoom) {
              const currentMembership = refreshedRoom.getMyMembership();
              logger.info(`[TelegramChatView] Room membership check attempt ${attempt + 1}: ${currentMembership}`);

              if (currentMembership === 'join') {
                joinSuccessful = true;
                logger.info(`[TelegramChatView] Successfully joined room on attempt ${attempt + 1}`);
                break;
              }
            } else {
              logger.warn(`[TelegramChatView] Room object not available on attempt ${attempt + 1}`);
            }
          }

          // If we still haven't joined successfully, try one more approach - force a room sync
          if (!joinSuccessful) {
            logger.warn(`[TelegramChatView] Join not confirmed after multiple checks, trying room sync`);

            try {
              // Force a room sync to update the room state
              await client.roomInitialSync(selectedContact.id, 100);

              // Check membership again after sync
              const syncedRoom = client.getRoom(selectedContact.id);
              if (syncedRoom) {
                const finalMembership = syncedRoom.getMyMembership();
                logger.info(`[TelegramChatView] Room membership after sync: ${finalMembership}`);

                if (finalMembership === 'join') {
                  joinSuccessful = true;
                  logger.info(`[TelegramChatView] Join confirmed after room sync`);
                }
              }
            } catch (syncError) {
              logger.warn(`[TelegramChatView] Room sync failed: ${syncError.message}`);
              // Continue with the process even if sync fails
            }
          }

          // If all our attempts failed, we'll proceed anyway but log a warning
          if (!joinSuccessful) {
            logger.warn(`[TelegramChatView] Could not confirm room join, but proceeding anyway`);

            // Force the client to recognize the room as joined
            try {
              // Get the room again
              room = client.getRoom(selectedContact.id);

              if (room) {
                // If the room object has a setMyMembership method, use it
                if (typeof room.setMyMembership === 'function') {
                  room.setMyMembership('join');
                  logger.info(`[TelegramChatView] Manually set room membership to 'join'`);
                }

                // Also try to force a room state update
                if (typeof room.updateMyMembership === 'function') {
                  room.updateMyMembership('join');
                  logger.info(`[TelegramChatView] Updated room membership to 'join'`);
                }
              }
            } catch (membershipError) {
              logger.warn(`[TelegramChatView] Error setting membership manually: ${membershipError.message}`);
              // Continue anyway
            }
          }
        } catch (joinError) {
          logger.error('[TelegramChatView] Error joining room:', joinError);
          showWelcomeMessages('Error joining room. Please try again later.');
          return;
        }
      } else if (membership !== 'join') {
        logger.warn(`[TelegramChatView] Room membership state is ${membership}, not 'join'`);
        showWelcomeMessages(`Cannot access room (membership: ${membership}). Please try again later.`);
        return;
      }

      // CRITICAL FIX: Ensure MatrixTimelineManager is properly initialized
      if (!matrixTimelineManager.initialized || !matrixTimelineManager.client) {
        logger.info('[TelegramChatView] Initializing MatrixTimelineManager');
        try {
          // First check if client is valid
          if (!client) {
            logger.error('[TelegramChatView] Cannot initialize MatrixTimelineManager: No Matrix client available');

            // Try to get client from window object
            if (window.matrixClient) {
              logger.info('[TelegramChatView] Found Matrix client in window object, using it');
              const initialized = matrixTimelineManager.initialize(window.matrixClient);

              if (!initialized) {
                logger.error('[TelegramChatView] Failed to initialize MatrixTimelineManager with window.matrixClient');
                showWelcomeMessages('Error initializing message loader. Please try again later.');
                return;
              }
            } else {
              logger.error('[TelegramChatView] No Matrix client available in window object either');
              showWelcomeMessages('Error initializing message loader. Please try again later.');
              return;
            }
          } else {
            // Initialize with the provided client
            const initialized = matrixTimelineManager.initialize(client);

            if (!initialized) {
              logger.error('[TelegramChatView] Failed to initialize MatrixTimelineManager');
              showWelcomeMessages('Error initializing message loader. Please try again later.');
              return;
            }
          }

          logger.info('[TelegramChatView] MatrixTimelineManager initialized successfully');
        } catch (error) {
          logger.error('[TelegramChatView] Error initializing MatrixTimelineManager:', error);
          showWelcomeMessages('Error initializing message loader. Please try again later.');
          return;
        }
      }

      // CRITICAL FIX: Try to get messages directly from the room timeline first
      // Refresh the room object to ensure we have the latest data
      room = client.getRoom(selectedContact.id);
      let loadedMessages = [];

      if (room && room.timeline && room.timeline.length > 0) {
        logger.info(`[TelegramChatView] Found ${room.timeline.length} events in room timeline, processing directly`);

        // Process the timeline events directly
        for (const event of room.timeline) {
          try {
            // Check if this is a Matrix event object or a plain event object
            const isMatrixEvent = typeof event.getType === 'function';

            // Get event properties safely with robust fallbacks
            const eventType = isMatrixEvent ? event.getType() : event.type;
            const sender = isMatrixEvent ? event.getSender() : event.sender;
            const content = isMatrixEvent ? event.getContent() : (event.content || {});

            // Handle timestamp with extra care to avoid the getOriginServerTs error
            let timestamp;
            try {
              if (isMatrixEvent && typeof event.getOriginServerTs === 'function') {
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
            } catch {
              timestamp = Date.now();
            }

            const eventId = isMatrixEvent ? event.getId() : (event.event_id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

            // Skip events without type or content
            if (!eventType) {
              continue;
            }

            // Create a message from this event
            if (eventType === 'm.room.message' ||
                eventType === 'm.sticker' ||
                eventType === 'm.room.encrypted' ||
                eventType === 'm.bridge' ||
                eventType === 'uk.half-shot.bridge' ||
                eventType === 'fi.mau.dummy.portal_created') {

              let messageBody = content.body || 'Message';
              if (eventType === 'm.bridge' || eventType === 'uk.half-shot.bridge') {
                messageBody = 'Telegram bridge connected';
              } else if (eventType === 'fi.mau.dummy.portal_created') {
                messageBody = 'Telegram chat connected';
              }

              const message = {
                id: eventId,
                sender: sender,
                senderName: sender,
                content: { ...content, body: messageBody },
                timestamp: timestamp,
                isFromMe: sender === client.getUserId(),
                eventType: eventType,
                roomId: selectedContact.id,
                rawEvent: event
              };

              loadedMessages.push(message);
            }
          } catch {
            // Continue to the next event
            continue;
          }
        }

        logger.info(`[TelegramChatView] Processed ${loadedMessages.length} messages directly from timeline`);
      }

      // If we didn't get any messages from the timeline, try MatrixTimelineManager as fallback
      if (loadedMessages.length === 0) {
        logger.info('[TelegramChatView] Stage 1: Loading messages with MatrixTimelineManager');
        const managerMessages = await matrixTimelineManager.loadMessages(selectedContact.id, {
          limit: 500, // Much higher limit to ensure we get ALL messages
          forceRefresh: true // Force refresh to get the latest messages
        });

        if (managerMessages && managerMessages.length > 0) {
          loadedMessages = managerMessages;
        }
      }

      // Stage 2: If we have very few messages, try a direct room sync to get the latest
      if (loadedMessages && loadedMessages.length < 20) {
        logger.info('[TelegramChatView] Stage 2: Few messages found, trying direct room sync');
        try {
          // Force a room sync to get the latest messages
          await client.roomInitialSync(selectedContact.id, 100);

          // Try loading messages again after sync
          const syncedMessages = await matrixTimelineManager.loadMessages(selectedContact.id, {
            limit: 500,
            forceRefresh: true
          });

          if (syncedMessages && syncedMessages.length > 0 && (!loadedMessages || syncedMessages.length > loadedMessages.length)) {
            logger.info(`[TelegramChatView] Room sync successful, found ${syncedMessages.length} messages`);
            // Use the synced messages instead
            // Create a new array with the synced messages
            const newMessages = [...syncedMessages];

            // Replace loadedMessages with the new messages
            if (loadedMessages) {
              loadedMessages.length = 0; // Clear the array
              loadedMessages.push(...newMessages); // Add the new messages
            } else {
              // If loadedMessages is undefined, create a new variable
              logger.info(`[TelegramChatView] Creating new loadedMessages array with ${newMessages.length} messages`);
              // We'll use newMessages directly in the next steps
            }
          }
        } catch (syncError) {
          logger.warn('[TelegramChatView] Error during room sync:', syncError);
          // Continue with the messages we already have
        }
      }

      // Log the message count by type for debugging
      const messageTypeCount = {};
      if (loadedMessages && Array.isArray(loadedMessages)) {
        loadedMessages.forEach(msg => {
          const type = msg.eventType || 'unknown';
          messageTypeCount[type] = (messageTypeCount[type] || 0) + 1;
        });
      }
      // Reduced logging to prevent console spam
      logger.debug(`[TelegramChatView] Message type counts: ${JSON.stringify(messageTypeCount)}`);

      // Mark all messages as read with enhanced error handling
      try {
        // Get the latest event in the room
        if (!room) {
          room = client.getRoom(selectedContact.id);
        }
        const timeline = room?.getLiveTimeline?.();
        if (timeline) {
          const events = timeline.getEvents();
          if (events && events.length > 0) {
            const latestEvent = events[events.length - 1];
            // Send read receipt for the latest event
            try {
              // Make sure we have a valid event ID
              const eventId = latestEvent.getId?.() || latestEvent.event_id;

              // Skip invalid event IDs (containing ~ or null/undefined)
              if (!eventId || eventId.includes('~')) {
                logger.warn(`[TelegramChatView] Skipping read receipt for invalid event ID: ${eventId}`);
              } else {
                // CRITICAL FIX: Try multiple methods to send read receipt
                let readReceiptSent = false;

                // Method 1: Use client.sendReadReceipt with getRoomId patch
                try {
                  // Check if the event has the required methods for sending a read receipt
                  if (typeof latestEvent.getRoomId !== 'function') {
                    // If the event doesn't have getRoomId, we need to add it
                    latestEvent.getRoomId = () => selectedContact.id;
                  }

                  if (typeof client.sendReadReceipt === 'function') {
                    client.sendReadReceipt(latestEvent);
                    logger.info(`[TelegramChatView] Sent read receipt for event ${eventId}`);
                    readReceiptSent = true;
                  }
                } catch (readError) {
                  logger.warn(`[TelegramChatView] Method 1 failed: ${readError.message}`);
                }

                // Method 2: Use client.sendReceipt if Method 1 failed
                if (!readReceiptSent) {
                  try {
                    if (typeof client.sendReceipt === 'function' && selectedContact.id && eventId) {
                      client.sendReceipt(selectedContact.id, eventId, 'm.read');
                      logger.info(`[TelegramChatView] Sent read receipt with sendReceipt for event ${eventId}`);
                      readReceiptSent = true;
                    }
                  } catch (receiptError) {
                    logger.warn(`[TelegramChatView] Method 2 failed: ${receiptError.message}`);
                  }
                }

                // Method 3: Use client.setRoomReadMarkers if Methods 1 and 2 failed
                if (!readReceiptSent) {
                  try {
                    if (typeof client.setRoomReadMarkers === 'function' && selectedContact.id && eventId) {
                      client.setRoomReadMarkers(selectedContact.id, eventId);
                      logger.info(`[TelegramChatView] Set read markers for event ${eventId}`);
                      readReceiptSent = true;
                    }
                  } catch (markersError) {
                    logger.warn(`[TelegramChatView] Method 3 failed: ${markersError.message}`);
                  }
                }

                if (!readReceiptSent) {
                  logger.warn(`[TelegramChatView] All read receipt methods failed for event ${eventId}`);
                }
              }
            } catch (readError) {
              logger.warn(`[TelegramChatView] Error sending read receipt: ${readError.message}`);
            }
          }
        }
      } catch (error) {
        logger.warn(`[TelegramChatView] Error sending read receipt: ${error.message}`);
      }

      // Debug output to see what we're getting
      logger.info(`[TelegramChatView] Got ${loadedMessages ? loadedMessages.length : 0} messages from MatrixTimelineManager`);
      if (loadedMessages && loadedMessages.length > 0) {
        // CRITICAL FIX: Removed excessive message logging to reduce console spam

        // Set messages directly
        setMessages(loadedMessages);
        return;
      } else {
        // If no messages were found, show welcome message
        logger.warn('[TelegramChatView] No messages found, showing welcome message');

        // Try one more time with a direct room sync
        try {
          logger.info('[TelegramChatView] Attempting one final direct room sync');

          // CRITICAL FIX: Try multiple methods to sync the room
          let syncResponse;
          try {
            // Method 1: Use client.roomInitialSync
            if (typeof client.roomInitialSync === 'function') {
              syncResponse = await client.roomInitialSync(selectedContact.id, 100);
              logger.info(`[TelegramChatView] Room sync response received with ${syncResponse?.messages?.chunk?.length || 0} events`);
            }
          } catch (syncError1) {
            logger.warn(`[TelegramChatView] roomInitialSync failed: ${syncError1.message}`);

            try {
              // Method 2: Use client.getRoom and force a timeline update
              const room = client.getRoom(selectedContact.id);
              if (room && typeof room.getLiveTimeline === 'function') {
                const timeline = room.getLiveTimeline();
                if (timeline && typeof timeline.getEvents === 'function') {
                  const events = timeline.getEvents();
                  syncResponse = { messages: { chunk: events } };
                  logger.info(`[TelegramChatView] Got ${events.length} events from room timeline`);
                }
              }
            } catch (syncError2) {
              logger.warn(`[TelegramChatView] Timeline method failed: ${syncError2.message}`);
            }
          }

          // Get the timeline directly from the Matrix client
          room = client.getRoom(selectedContact.id);
          if (room) {
            logger.info(`[TelegramChatView] Got room object, timeline length: ${room.timeline ? room.timeline.length : 'unknown'}`);

            // Process the timeline events directly
            if (room.timeline && room.timeline.length > 0) {
              // Process the events directly
              const processedMessages = [];

              for (const event of room.timeline) {
                try {
                  // Check if this is a Matrix event object or a plain event object
                  const isMatrixEvent = typeof event.getType === 'function';

                  // Get event properties safely with robust fallbacks
                  const eventType = isMatrixEvent ? event.getType() : event.type;
                  const sender = isMatrixEvent ? event.getSender() : event.sender;
                  const content = isMatrixEvent ? event.getContent() : (event.content || {});

                  // Handle timestamp with extra care to avoid the getOriginServerTs error
                  let timestamp;
                  try {
                    if (isMatrixEvent && typeof event.getOriginServerTs === 'function') {
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
                  } catch (tsError) {
                    logger.debug(`[TelegramChatView] Error getting timestamp: ${tsError.message}`);
                    timestamp = Date.now();
                  }

                  const eventId = isMatrixEvent ? event.getId() : (event.event_id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

                  // Log the event details for debugging
                  logger.debug(`[TelegramChatView] Processing timeline event: type=${eventType}, sender=${sender}, id=${eventId}`);

                  // Skip events without type or content
                  if (!eventType) {
                    logger.debug('[TelegramChatView] Skipping event with no type');
                    continue;
                  }

                  // Create a message from this event
                  if (eventType === 'm.room.message' ||
                      eventType === 'm.sticker' ||
                      eventType === 'm.room.encrypted' ||
                      eventType === 'm.bridge' ||
                      eventType === 'uk.half-shot.bridge' ||
                      eventType === 'fi.mau.dummy.portal_created') {

                    let messageBody = content.body || 'Message';
                    if (eventType === 'm.bridge' || eventType === 'uk.half-shot.bridge') {
                      messageBody = 'Telegram bridge connected';
                    } else if (eventType === 'fi.mau.dummy.portal_created') {
                      messageBody = 'Telegram chat connected';
                    }

                    const message = {
                      id: eventId,
                      sender: sender,
                      senderName: sender,
                      content: { ...content, body: messageBody },
                      timestamp: timestamp,
                      isFromMe: sender === client.getUserId(),
                      eventType: eventType,
                      roomId: selectedContact.id,
                      rawEvent: event
                    };

                    processedMessages.push(message);
                  }
                } catch (eventError) {
                  logger.warn(`[TelegramChatView] Error processing timeline event: ${eventError.message}`);
                  // Continue to the next event
                  continue;
                }
              }

              if (processedMessages.length > 0) {
                logger.info(`[TelegramChatView] Processed ${processedMessages.length} messages directly from timeline`);
                setMessages(processedMessages);
                return;
              }
            }
          }

          // Try loading messages one more time with the timeline manager
          const finalSyncMessages = await matrixTimelineManager.loadMessages(selectedContact.id, {
            limit: 500,
            forceRefresh: true
          });

          if (finalSyncMessages && finalSyncMessages.length > 0) {
            logger.info(`[TelegramChatView] Final sync successful, found ${finalSyncMessages.length} messages`);

            // Update state with the messages
            setMessages(finalSyncMessages);
            return;
          } else {
            logger.warn('[TelegramChatView] Final sync attempt returned no messages, checking cache');

            // Try to get messages from cache as a last resort
            try {
              const cachedMessages = await matrixTimelineManager.getCachedMessages(selectedContact.id);
              if (cachedMessages && cachedMessages.length > 0) {
                logger.info(`[TelegramChatView] Found ${cachedMessages.length} messages in cache`);
                setMessages(cachedMessages);
                return;
              }
            } catch (cacheError) {
              logger.warn('[TelegramChatView] Error retrieving cached messages:', cacheError);
            }
          }
        } catch (finalSyncError) {
          logger.warn('[TelegramChatView] Error during final sync attempt:', finalSyncError);
          // Continue to show welcome message
        }

        // If we still don't have messages, show a welcome message
        showWelcomeMessages('No messages found. Start a conversation!');
        return;
      }


    } catch (error) {
      logger.error('[TelegramChatView] Error loading messages:', error);
      setError('Failed to load messages');
      showWelcomeMessages('Error loading messages. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [selectedContact, client, setMessages, setLoading, setError]);

  // CRITICAL FIX: Load messages and set up real-time updates when selected contact changes and confirmation is not needed
  // This effect now uses a ref to track if it's already run for this contact to prevent infinite loops
  const contactProcessedRef = useRef(null);

  // CRITICAL FIX: Add a reference for the timeline update handler
  // const timelineUpdateHandlerRef = useRef(null); // REMOVED - No longer used

  // CRITICAL FIX: Global event counter and timestamp refs are defined at the top of the component
  // These help detect when refreshes should happen

  // CRITICAL FIX: Add forced refresh timer
  useEffect(() => {
    if (selectedContact && client && !needsConfirmation) {
      logger.info('[TelegramChatView] Setting up forced refresh interval check');

      // Use a shorter interval (3 seconds) for more aggressive refresh
      const forcedRefreshInterval = setInterval(() => {
        try {
          const now = Date.now();

          // Only perform refresh if it's been at least 10 seconds since the last one
          if (now - lastMessageTimestampRef.current > 10000) {
            logger.info('[TelegramChatView] Performing scheduled refresh check');

            const room = client.getRoom(selectedContact.id);
            if (room && room.timeline) {
              // See if there are more events than we know about
              const timelineLength = room.timeline.length;

              if (timelineLength > eventCounterRef.current) {
                logger.info(`[TelegramChatView] 🔄 FORCE REFRESH: Detected new events in timer: known=${eventCounterRef.current}, current=${timelineLength}`);
                loadMessages(true);
                eventCounterRef.current = timelineLength;
                lastMessageTimestampRef.current = now;
              } else {
                // Even if no new events detected, periodically force a sync and check again
                // This helps catch events that might be missed by the event listeners
                if (now - lastMessageTimestampRef.current > 30000) { // Every 30 seconds
                  logger.info('[TelegramChatView] Performing periodic forced sync check');

                  // Try to force a sync
                  if (typeof client.retryImmediately === 'function') {
                    client.retryImmediately();
                    logger.info('[TelegramChatView] Triggered immediate sync in timer');
                  }

                  // Schedule a refresh check after the sync has time to complete
                  setTimeout(() => {
                    try {
                      // Check again after sync
                      const room = client.getRoom(selectedContact.id);
                      if (room && room.timeline) {
                        const updatedLength = room.timeline.length;

                        if (updatedLength > eventCounterRef.current) {
                          logger.info(`[TelegramChatView] 🔄 FORCE REFRESH: New events after sync: ${updatedLength} > ${eventCounterRef.current}`);
                          loadMessages(true);
                          eventCounterRef.current = updatedLength;
                          lastMessageTimestampRef.current = Date.now();
                        }
                      }
                    } catch (innerError) {
                      logger.error(`[TelegramChatView] Error in post-sync refresh check: ${innerError.message}`);
                    }
                  }, 2000);
                }
              }
            }
          }
        } catch (error) {
          logger.error(`[TelegramChatView] Error in refresh interval: ${error.message}`);
        }
      }, 3000); // Check every 3 seconds

      return () => {
        clearInterval(forcedRefreshInterval);
        logger.info('[TelegramChatView] Cleared forced refresh interval');
      };
    }
  }, [selectedContact, client, needsConfirmation, loadMessages]);

  useEffect(() => {
    // ... (initial checks for client, selectedContact, needsConfirmation) ...
    if (!selectedContact || !client || needsConfirmation) { return; }
    // ... (contactProcessedRef check) ...
    if (contactProcessedRef.current === selectedContact.id) { return; }
    contactProcessedRef.current = selectedContact.id;
    logger.info(`[TelegramChatView] Running MAIN effect to set up listeners for ${selectedContact.id}`);
    logger.info(`[TelegramChatView] Client sync state at MAIN listener attach: ${client?.getSyncState()}`);

    // --- Setup Sync Handler (Ensure syncHandler is defined in hook scope) ---
    const syncHandler = (state, prevState) => { // <<<< DEFINED HERE in the main scope of the hook
      if (state === 'SYNCING' && prevState === 'PREPARED') {
          logger.info(`[TelegramChatView] Matrix sync completed (via main listener), checking for new messages`);
          const room = client.getRoom(selectedContact.id);
          if (room) {
              const liveTimeline = room.getLiveTimeline();
              if (liveTimeline) {
                  const events = liveTimeline.getEvents();
                  const timelineLength = events.length;
                  if (timelineLength > eventCounterRef.current) {
                      logger.info(`[TelegramChatView] Detected new events after sync: known=${eventCounterRef.current}, current=${timelineLength}`);
                      loadMessages(true); // forceRefresh = true
                      eventCounterRef.current = timelineLength;
                      lastMessageTimestampRef.current = Date.now();
                  }
              }
          }
      }
    };
    client.on('sync', syncHandler); // <<<< ATTACHED HERE
    logger.info(`[TelegramChatView] Attached 'sync' listener for room ${selectedContact.id}`);
    // Store sync handler reference using a Map for safe removal
    if (!window._matrixSyncListeners) window._matrixSyncListeners = new Map();
    window._matrixSyncListeners.set(selectedContact.id, syncHandler);
    // --- End Setup Sync Handler ---

    // --- Initial Setup --- (Keep existing)
    if (selectedContact.id) {
      logger.info(`[TelegramChatView] Triggering setupRealTimeUpdates for room ${selectedContact.id}`);
      setupRealTimeUpdates(selectedContact.id); // Call simplified version
    }
    const initialRoom = client.getRoom(selectedContact.id);
    if (initialRoom?.timeline) {
      eventCounterRef.current = initialRoom.timeline.length;
      logger.info(`[TelegramChatView] Initial event count set: ${eventCounterRef.current}`);
    }
    loadMessages(); // Initial load
    // --- End Initial Setup ---

    // Return cleanup function
    return () => {
      logger.info(`[TelegramChatView] Running MAIN cleanup for effect related to ${selectedContact?.id || 'previous contact'}`);
      contactProcessedRef.current = null;

      // CRITICAL FIX: Comprehensive cleanup of all listeners
      try {
        if (selectedContact?.id) {
          // 1. Remove sync listener
          const syncHandlerInstance = window._matrixSyncListeners?.get(selectedContact.id);
          if (client && syncHandlerInstance) {
            client.removeListener('sync', syncHandlerInstance);
            window._matrixSyncListeners.delete(selectedContact.id);
            logger.info(`[TelegramChatView] Removed sync listener for room ${selectedContact.id}`);
          }

          // 2. Remove MatrixTimelineManager listeners
          if (matrixTimelineManager.initialized) {
            matrixTimelineManager.removeRoomListeners(selectedContact.id);
            logger.info(`[TelegramChatView] Removed MatrixTimelineManager listeners for room ${selectedContact.id}`);
          }

          // 3. Remove direct client listeners
          if (window._matrixDirectListeners && window._matrixDirectListeners.has(selectedContact.id)) {
            const directListener = window._matrixDirectListeners.get(selectedContact.id);
            if (client) {
              client.removeListener('Room.timeline', directListener);
            }
            window._matrixDirectListeners.delete(selectedContact.id);
            logger.info(`[TelegramChatView] Removed direct client listener for room ${selectedContact.id}`);
          }

          // 4. Remove room-level listeners
          if (client) {
            const room = client.getRoom(selectedContact.id);
            if (room && window._matrixRoomListeners && window._matrixRoomListeners.has(selectedContact.id)) {
              const roomListener = window._matrixRoomListeners.get(selectedContact.id);
              room.removeListener('Room.timeline', roomListener);
              window._matrixRoomListeners.delete(selectedContact.id);
              logger.info(`[TelegramChatView] Removed room-level listener for room ${selectedContact.id}`);
            }
          }
        }
      } catch (error) {
        logger.warn(`[TelegramChatView] Error during comprehensive cleanup: ${error.message}`);
      }
    };
    // Dependencies for this main setup hook
  }, [selectedContact, client, needsConfirmation, loadMessages, setupRealTimeUpdates]);

  // REMOVED: Force sync on component mount - this was causing infinite loops

  // Add a cleanup effect when component unmounts
  useEffect(() => {
    // Return cleanup function for component unmount
    return () => {
      logger.info('[TelegramChatView] Component unmounting, cleaning up resources');
      // Clean up any cached data or listeners
      if (matrixTimelineManager && matrixTimelineManager.initialized) {
        try {
          matrixTimelineManager.cleanup();
        } catch (error) {
          logger.warn('[TelegramChatView] Error during final cleanup:', error);
        }
      }
    };
  }, []);

  // Add keyboard shortcut for AI Assistant (Alt+A)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Alt+A to open AI Assistant
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        // Find the AI Assistant button and click it
        const aiButton = document.querySelector('.ai-assistant-button');
        if (aiButton) {
          aiButton.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // First-time user experience for AI button
  useEffect(() => {
    if (selectedContact) {
      // Check if user has seen the AI button highlight
      const aiButtonHighlighted = localStorage.getItem('ai_button_highlighted');

      if (aiButtonHighlighted !== 'true') {
        // Wait for the DOM to update
        setTimeout(() => {
          const aiButton = document.querySelector('.ai-assistant-button-composer');
          const aiButtonContainer = document.querySelector('.ai-button-container');
          if (aiButton && aiButtonContainer) {
            // Add a pulsing animation to draw attention
            aiButton.classList.add('animate-attention');

            // Add a tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'absolute -top-16 left-1/2 transform -translate-x-1/2 bg-[#0088CC] text-white text-xs py-2 px-3 rounded shadow-lg whitespace-nowrap z-50';
            tooltip.innerHTML = 'Try the AI Assistant! <span class="text-xs opacity-80">(Alt+A)</span>';

            // Add arrow
            const arrow = document.createElement('div');
            arrow.className = 'absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-[#0088CC] rotate-45';
            tooltip.appendChild(arrow);

            aiButtonContainer.appendChild(tooltip);

            // Remove after 5 seconds
            setTimeout(() => {
              aiButton.classList.remove('animate-attention');
              if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
              }
              localStorage.setItem('ai_button_highlighted', 'true');
            }, 5000);
          }
        }, 2000);
      }
    }
  }, [selectedContact]);

  // Track if user has manually scrolled up
  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 50;

    // If user has scrolled up, mark it
    if (!isScrolledToBottom && !userHasScrolled.current) {
      userHasScrolled.current = true;
      setShouldScrollToBottom(false);
    }

    // If user has scrolled back to bottom, reset
    if (isScrolledToBottom && userHasScrolled.current) {
      userHasScrolled.current = false;
      setShouldScrollToBottom(true);
    }
  }, []); // Remove userHasScrolled from dependencies since we're using ref

  // Scroll to bottom only when appropriate
  useEffect(() => {
    if (messagesEndRef.current && shouldScrollToBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, shouldScrollToBottom]);

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

  // Note: fetchParentEvents is already defined above

  // Note: loadMessages is already defined above

  // Note: We're using MatrixTimelineManager to process events into messages
  // The implementation is in matrixTimelineManager.js

  // Implementation of setupRealTimeUpdates with enhanced reliability
  setupRealTimeUpdates = useCallback((roomId) => {
    if (!roomId || !client) {
      logger.warn(`[TelegramChatView] setupRealTimeUpdates: Called with missing roomId or client.`);
      return false;
    }
    logger.info(`[TelegramChatView] setupRealTimeUpdates: Setting up comprehensive real-time updates for ${roomId}`);

    // CRITICAL FIX: First, remove any existing listeners to prevent duplicates
    try {
      // 1. Remove MatrixTimelineManager listeners
      if (matrixTimelineManager.initialized) {
        matrixTimelineManager.removeRoomListeners(roomId);
        logger.info(`[TelegramChatView] setupRealTimeUpdates: Cleared MatrixTimelineManager listeners for room ${roomId}`);
      }

      // 2. Remove any direct client listeners we might have added previously
      if (window._matrixDirectListeners && window._matrixDirectListeners.has(roomId)) {
        const directListener = window._matrixDirectListeners.get(roomId);
        client.removeListener('Room.timeline', directListener);
        window._matrixDirectListeners.delete(roomId);
        logger.info(`[TelegramChatView] setupRealTimeUpdates: Removed direct client listener for room ${roomId}`);
      }

      // 3. Remove any room-level listeners
      const room = client.getRoom(roomId);
      if (room && window._matrixRoomListeners && window._matrixRoomListeners.has(roomId)) {
        const roomListener = window._matrixRoomListeners.get(roomId);
        room.removeListener('Room.timeline', roomListener);
        window._matrixRoomListeners.delete(roomId);
        logger.info(`[TelegramChatView] setupRealTimeUpdates: Removed room-level listener for room ${roomId}`);
      }
    } catch (error) {
      logger.warn(`[TelegramChatView] setupRealTimeUpdates: Error clearing existing listeners: ${error.message}`);
    }

    // CRITICAL FIX: Now set up a comprehensive set of listeners for maximum reliability
    try {
      // 1. Create a direct client-level listener
      const directTimelineListener = (event, room, toStartOfTimeline, removed) => {
        // Only process events for this room
        if (!room || room.roomId !== roomId) return;

        // Skip events that are being added to the start of the timeline (historical)
        if (toStartOfTimeline) return;

        // Skip removed events
        if (removed) return;

        try {
          // Get event details
          const eventType = event.getType?.() || event.type;
          const eventId = event.getId?.() || event.event_id;

          // Only process message events
          if (eventType !== 'm.room.message' &&
              eventType !== 'm.sticker' &&
              eventType !== 'uk.half-shot.bridge' &&
              !eventType.includes('telegram')) {
            return;
          }

          logger.info(`[TelegramChatView] DIRECT LISTENER: New event in room ${roomId}: ${eventType} (${eventId})`);

          // Force a refresh of messages
          loadMessages(true); // Pass true to force refresh
        } catch (error) {
          logger.error(`[TelegramChatView] Error in direct timeline listener: ${error.message}`);
        }
      };

      // Add the direct listener to the client
      client.on('Room.timeline', directTimelineListener);

      // Store for cleanup
      if (!window._matrixDirectListeners) window._matrixDirectListeners = new Map();
      window._matrixDirectListeners.set(roomId, directTimelineListener);
      logger.info(`[TelegramChatView] setupRealTimeUpdates: Added direct client-level timeline listener for room ${roomId}`);

      // 2. Also add a room-level listener for even more reliability
      try {
        const room = client.getRoom(roomId);
        if (room) {
          room.on('Room.timeline', directTimelineListener);
          if (!window._matrixRoomListeners) window._matrixRoomListeners = new Map();
          window._matrixRoomListeners.set(roomId, directTimelineListener);
          logger.info(`[TelegramChatView] setupRealTimeUpdates: Added room-level timeline listener for room ${roomId}`);
        }
      } catch (error) {
        logger.warn(`[TelegramChatView] setupRealTimeUpdates: Error adding room-level listener: ${error.message}`);
      }

      // 3. Also use MatrixTimelineManager for additional reliability
      try {
        if (matrixTimelineManager.initialized) {
          matrixTimelineManager.addRoomListener(roomId, 'timeline', (event) => {
            try {
              // Get event details
              const eventType = event.getType?.() || event.type;
              const eventId = event.getId?.() || event.event_id;

              logger.info(`[TelegramChatView] MTM LISTENER: New event in room ${roomId}: ${eventType} (${eventId})`);

              // Force a refresh of messages
              loadMessages(true); // Pass true to force refresh
            } catch (error) {
              logger.error(`[TelegramChatView] Error in MTM timeline listener: ${error.message}`);
            }
          });
          logger.info(`[TelegramChatView] setupRealTimeUpdates: Added MatrixTimelineManager timeline listener for room ${roomId}`);
        }
      } catch (error) {
        logger.warn(`[TelegramChatView] setupRealTimeUpdates: Error adding MTM listener: ${error.message}`);
      }

      return true;
    } catch (error) {
      logger.error(`[TelegramChatView] setupRealTimeUpdates: Error setting up listeners: ${error.message}`);
      return false;
    }
  }, [client, loadMessages]); // Added loadMessages back as a dependency since we're using it

  // Load more messages (older messages) with enhanced reliability
  const loadMoreMessages = async () => {
    if (!selectedContact || !client || !oldestEventId || loadingMore || !hasMoreMessages) {
      return;
    }

    setLoadingMore(true);
    try {
      logger.info(`[TelegramChatView] Loading more messages before ${oldestEventId}`);

      // CRITICAL FIX: Ensure MatrixTimelineManager is properly initialized
      if (!matrixTimelineManager.initialized || !matrixTimelineManager.client) {
        logger.info('[TelegramChatView] Initializing MatrixTimelineManager for loading more messages');
        try {
          // First check if client is valid
          if (!client) {
            logger.error('[TelegramChatView] Cannot initialize MatrixTimelineManager: No Matrix client available');

            // Try to get client from window object
            if (window.matrixClient) {
              logger.info('[TelegramChatView] Found Matrix client in window object, using it');
              const initialized = matrixTimelineManager.initialize(window.matrixClient);

              if (!initialized) {
                logger.error('[TelegramChatView] Failed to initialize MatrixTimelineManager with window.matrixClient');
                return;
              }
            } else {
              logger.error('[TelegramChatView] No Matrix client available in window object either');
              return;
            }
          } else {
            // Initialize with the provided client
            const initialized = matrixTimelineManager.initialize(client);

            if (!initialized) {
              logger.error('[TelegramChatView] Failed to initialize MatrixTimelineManager');
              return;
            }
          }

          logger.info('[TelegramChatView] MatrixTimelineManager initialized successfully for loading more messages');
        } catch (error) {
          logger.error('[TelegramChatView] Error initializing MatrixTimelineManager for loading more messages:', error);
          return;
        }
      }

      // Multi-stage approach to load older messages
      // Stage 1: Use MatrixTimelineManager to load more messages
      logger.info('[TelegramChatView] Stage 1: Loading older messages with MatrixTimelineManager');
      const olderMessages = await matrixTimelineManager.loadMessages(selectedContact.id, {
        limit: 200, // Increased limit for better pagination
        direction: 'b', // backwards to get historical messages
        from: oldestEventId
      });

      // Stage 2: If we got very few messages, try direct pagination
      let additionalMessages = [];
      if (olderMessages.length < 20) {
        logger.info('[TelegramChatView] Stage 2: Few older messages found, trying direct pagination');
        try {
          // Get the room
          const room = client.getRoom(selectedContact.id);
          if (room) {
            // Try to use the client's roomMessages API directly
            const response = await client.roomMessages(selectedContact.id, oldestEventId, 100, 'b');

            if (response && response.chunk && response.chunk.length > 0) {
              logger.info(`[TelegramChatView] Direct pagination found ${response.chunk.length} messages`);

              // Process these events into messages
              for (const event of response.chunk) {
                // Add necessary methods if they don't exist
                if (typeof event.isLiveEvent !== 'function') {
                  event.isLiveEvent = () => false;
                }

                // Create a message from the event
                const message = matrixTimelineManager._createMessageFromEvent(event, room);
                if (message && message.id) {
                  additionalMessages.push(message);
                }
              }

              logger.info(`[TelegramChatView] Processed ${additionalMessages.length} additional messages`);
            }
          }
        } catch (paginationError) {
          logger.warn('[TelegramChatView] Error during direct pagination:', paginationError);
          // Continue with the messages we already have
        }
      }

      // Combine all messages
      const allOlderMessages = [...olderMessages, ...additionalMessages];

      if (!allOlderMessages || allOlderMessages.length === 0) {
        logger.info('[TelegramChatView] No more older messages found');
        setHasMoreMessages(false);
        return;
      }

      logger.info(`[TelegramChatView] Loaded ${allOlderMessages.length} older messages in total`);

      // Fetch parent events for replies
      await fetchParentEvents(allOlderMessages);

      // Merge with existing messages, avoiding duplicates
      const existingIds = new Set(messages.map(msg => msg.id));
      const newMessages = allOlderMessages.filter(msg => !existingIds.has(msg.id));

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

  // Note: We're using MatrixTimelineManager for real-time updates and message loading
  // The implementation is in matrixTimelineManager.js

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !selectedContact || !client || sending) return;

    // Store the message text before clearing the input
    const messageText = inputMessage.trim();

    // Clear the input field immediately for better UX
    setInputMessage('');

    // Focus back on the input field
    const inputField = document.getElementById('message-input');
    if (inputField) {
      inputField.focus();
    }

    setSending(true);
    try {
      logger.info(`[TelegramChatView] Sending message to ${selectedContact.name}`);

      // CRITICAL FIX: Ensure MatrixTimelineManager is properly initialized
      if (!matrixTimelineManager.initialized || !matrixTimelineManager.client) {
        logger.info('[TelegramChatView] Initializing MatrixTimelineManager for sending message');
        try {
          // First check if client is valid
          if (!client) {
            logger.error('[TelegramChatView] Cannot initialize MatrixTimelineManager: No Matrix client available');

            // Try to get client from window object
            if (window.matrixClient) {
              logger.info('[TelegramChatView] Found Matrix client in window object, using it');
              const initialized = matrixTimelineManager.initialize(window.matrixClient);

              if (!initialized) {
                logger.error('[TelegramChatView] Failed to initialize MatrixTimelineManager with window.matrixClient');
                throw new Error('Failed to initialize MatrixTimelineManager');
              }
            } else {
              logger.error('[TelegramChatView] No Matrix client available in window object either');
              throw new Error('No Matrix client available');
            }
          } else {
            // Initialize with the provided client
            const initialized = matrixTimelineManager.initialize(client);

            if (!initialized) {
              logger.error('[TelegramChatView] Failed to initialize MatrixTimelineManager');
              throw new Error('Failed to initialize MatrixTimelineManager');
            }
          }

          logger.info('[TelegramChatView] MatrixTimelineManager initialized successfully for sending message');
        } catch (error) {
          logger.error('[TelegramChatView] Error initializing MatrixTimelineManager:', error);
          throw new Error('Failed to initialize MatrixTimelineManager: ' + error.message);
        }
      }

      // Check if the room exists and we have permission to send messages
      const room = client.getRoom(selectedContact.id);
      if (!room) {
        throw new Error(`Room ${selectedContact.id} not found`);
      }

      // Check if we're joined to the room
      const membership = room.getMyMembership();
      if (membership !== 'join') {
        logger.warn(`[TelegramChatView] Not joined to room ${selectedContact.id}, current membership: ${membership}`);

        // Try to join the room if we're invited
        if (membership === 'invite') {
          logger.info(`[TelegramChatView] Attempting to join room ${selectedContact.id}`);
          await client.joinRoom(selectedContact.id);

          // Wait a moment for the room state to update
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw new Error(`Cannot send message: Not joined to room (membership: ${membership})`);
        }
      }

      // Prepare message content
      let messageContent;

      // If it's a simple text message
      if (!replyToEvent) {
        // Create a proper content object for better compatibility
        messageContent = {
          msgtype: 'm.text',
          body: messageText, // Use the stored message text
          format: 'org.matrix.custom.html',  // Support HTML formatting if present
          formatted_body: messageText.replace(/\n/g, '<br/>')  // Convert newlines to <br/>
        };
      } else {
        // If replying to a message, add reply information
        logger.info(`[TelegramChatView] Sending reply to event ${replyToEvent.getId?.() || replyToEvent.id}`);

        // Create content object with reply information
        messageContent = {
          msgtype: 'm.text',
          body: messageText, // Use the stored message text
          format: 'org.matrix.custom.html',
          formatted_body: messageText.replace(/\n/g, '<br/>')
        };

        // Add reply relation
        addReplyToMessageContent(messageContent, replyToEvent);
      }

      // Create a unique ID for the optimistic message
      const optimisticId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Create an optimistic message to show immediately
      const optimisticMessage = {
        id: optimisticId,
        sender: client.getUserId(),
        senderName: 'You',
        content: messageContent,
        body: messageText, // Use the stored message text
        timestamp: Date.now(),
        isFromMe: true,
        eventType: 'm.room.message',
        roomId: selectedContact.id,
        isOptimistic: true, // Mark as optimistic update
        status: 'sending' // Track sending status
      };

      // Add the optimistic message to the state BEFORE sending
      // This ensures the user sees their message immediately
      try {
        setMessages(prevMessages => {
          try {
            const updatedMessages = [...prevMessages, optimisticMessage].sort((a, b) => a.timestamp - b.timestamp);

            // When sending a message, we always want to scroll to bottom
            setShouldScrollToBottom(true);
            userHasScrolled.current = false;

            return updatedMessages;
          } catch (innerError) {
            logger.error('[TelegramChatView] Error adding optimistic message:', innerError);
            return prevMessages; // Return unchanged messages on error
          }
        });
      } catch (outerError) {
        logger.error('[TelegramChatView] Error updating messages state with optimistic message:', outerError);
      }

      // Clear input and reply state immediately for better UX
      setInputMessage('');
      setReplyToEvent(null);

      // Scroll to bottom immediately when sending a message
      setShouldScrollToBottom(true);
      userHasScrolled.current = false;

      // Now send the actual message in the background
      logger.info(`[TelegramChatView] Sending message with content:`, JSON.stringify(messageContent).substring(0, 100) + '...');

      // CRITICAL FIX: Try multiple methods to send the message
      let eventId;
      try {
        // Method 1: Use MatrixTimelineManager
        logger.info('[TelegramChatView] Attempting to send message via MatrixTimelineManager');
        eventId = await matrixTimelineManager.sendMessage(selectedContact.id, messageContent);
      } catch (sendError1) {
        logger.warn(`[TelegramChatView] Failed to send via MatrixTimelineManager: ${sendError1.message}`);

        try {
          // Method 2: Use client directly
          logger.info('[TelegramChatView] Attempting to send message via client directly');
          const response = await client.sendEvent(selectedContact.id, 'm.room.message', messageContent);
          eventId = response.event_id;
        } catch (sendError2) {
          logger.warn(`[TelegramChatView] Failed to send via client.sendEvent: ${sendError2.message}`);

          try {
            // Method 3: Use client.sendMessage
            logger.info('[TelegramChatView] Attempting to send message via client.sendMessage');
            const response = await client.sendMessage(selectedContact.id, messageContent);
            eventId = response.event_id;
          } catch (sendError3) {
            logger.error(`[TelegramChatView] All message sending methods failed: ${sendError3.message}`);
            throw new Error('Failed to send message after multiple attempts');
          }
        }
      }

      if (eventId) {
        logger.info(`[TelegramChatView] Message sent successfully with event ID: ${eventId}`);
        toast.success('Message sent', { duration: 2000, position: 'bottom-right' });

        // Store the event ID to prevent duplicate processing when it comes through the timeline
        window.lastSentEventId = eventId;

        // Store the mapping between optimistic ID and real event ID
        window.optimisticMessageMap = window.optimisticMessageMap || new Map();
        window.optimisticMessageMap.set(optimisticId, eventId);

        // Replace the optimistic message with the real one
        try {
          setMessages(prevMessages => {
            try {
              // Find and replace the optimistic message with the real one
              return prevMessages.map(msg => {
                if (msg.id === optimisticId) {
                  // Return a new message with the real event ID but keep the same content
                  return {
                    ...msg,
                    id: eventId,
                    isOptimistic: false,
                    status: 'sent'
                  };
                }
                return msg;
              });
            } catch (innerError) {
              logger.error('[TelegramChatView] Error replacing optimistic message:', innerError);
              return prevMessages; // Return unchanged messages on error
            }
          });
        } catch (outerError) {
          logger.error('[TelegramChatView] Error updating messages state after send:', outerError);
        }

        // Don't reload messages after sending - this causes duplicates and poor UX
        // Instead, ensure the real-time updates are properly set up
        if (setupRealTimeUpdates) {
          // Check if we already have a listener for this room
          const hasListener = matrixTimelineManager.hasRoomListener(selectedContact.id, 'timeline');

          if (!hasListener) {
            logger.info(`[TelegramChatView] Setting up real-time updates after message send for room ${selectedContact.id}`);
            setupRealTimeUpdates(selectedContact.id);
          } else {
            logger.info(`[TelegramChatView] Real-time updates already set up for room ${selectedContact.id}`);
          }
        }

        // Clear the ID after a short delay to allow for processing
        setTimeout(() => {
          window.lastSentEventId = null;
          if (window.optimisticMessageMap) {
            window.optimisticMessageMap.delete(optimisticId);
          }
        }, 10000);
      } else {
        logger.warn('[TelegramChatView] Message sent but no event ID returned');
        toast.error('Failed to send message', { duration: 3000, position: 'bottom-right' });

        // Mark the optimistic message as failed
        setMessages(prevMessages => {
          return prevMessages.map(msg => {
            if (msg.id === optimisticId) {
              return {
                ...msg,
                status: 'failed',
                error: true
              };
            }
            return msg;
          });
        });
      }
    } catch (err) {
      logger.error('[TelegramChatView] Error sending message:', err);
      toast.error(`Failed to send message: ${err.message || 'Please try again'}`);
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
    <div className="chat-view-container telegram-chat-view h-full flex flex-col bg-neutral-900 relative">
      {/* Room Members Panel */}
      {showMemberList && (
        <div className="absolute inset-0 z-20">
          <RoomMemberList
            roomId={selectedContact.id}
            onClose={() => setShowMemberList(false)}
          />
        </div>
      )}

      {/* AI Feature Tour */}
      {showAITour && (
        <AIFeatureTour onClose={() => setShowAITour(false)} />
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

        <div className="flex items-center gap-2" id="header-buttons">
          {/* Refresh button */}
          <button
            onClick={async () => {
              const refreshToastId = 'refresh-toast';
              toast.loading('Refreshing messages...', { id: refreshToastId });
              logger.info(`[TelegramChatView] 🔄 MANUAL REFRESH triggered for room ${selectedContact.id}`);

              if (!client || !selectedContact?.id) {
                toast.error('Client or contact not available.', { id: refreshToastId });
                logger.error('[TelegramChatView] Manual Refresh: Client or contact ID missing.');
                return;
              }

              setMessages([]); // Clear messages for loading state

              try {
                // Step 1: Request a sync
                logger.info('[TelegramChatView] Manual Refresh: Requesting client sync.');
                if (typeof client.retryImmediately === 'function') {
                  client.retryImmediately();
                } else if (typeof client.startClient === 'function' && client.getSyncState() === 'ERROR') {
                  // If retryImmediately is not available and client is in error, try restarting
                   logger.warn('[TelegramChatView] Manual Refresh: retryImmediately not available, client in ERROR. Attempting to restart client.');
                   await client.startClient();
                }


                // Step 2: Wait for the sync to actually make progress or complete
                // This promise will resolve when the client sync state is 'SYNCING' or 'PREPARED'
                // or timeout after 15s
                await new Promise((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    logger.warn('[TelegramChatView] Manual Refresh: Timeout waiting for sync completion.');
                    reject(new Error('Timeout waiting for sync completion'));
                  }, 15000); // 15 seconds timeout

                  const onSync = (state, prevState) => {
                    logger.info(`[TelegramChatView] Manual Refresh: Sync state changed: ${prevState} -> ${state}`);
                    if (state === 'SYNCING' || state === 'PREPARED') {
                      clearTimeout(timeout);
                      client.removeListener('sync', onSync);
                      logger.info('[TelegramChatView] Manual Refresh: Sync progressed/completed.');
                      resolve();
                    } else if (state === 'ERROR') {
                       clearTimeout(timeout);
                       client.removeListener('sync', onSync);
                       logger.error('[TelegramChatView] Manual Refresh: Sync entered ERROR state.');
                       reject(new Error('Client sync failed'));
                    }
                  };
                  client.on('sync', onSync);
                  // Also check current state, in case sync is already good
                  const currentState = client.getSyncState();
                  if (currentState === 'SYNCING' || currentState === 'PREPARED') {
                      onSync(currentState, currentState); // Manually trigger to resolve promise
                  }
                });

                // Step 3: CRITICAL FIX - First remove all listeners to ensure clean state
                logger.info('[TelegramChatView] Manual Refresh: Removing all existing listeners for clean state');
                try {
                  // Remove MatrixTimelineManager listeners
                  if (matrixTimelineManager.initialized) {
                    matrixTimelineManager.removeRoomListeners(selectedContact.id);
                  }

                  // Remove any direct client listeners
                  if (window._matrixDirectListeners && window._matrixDirectListeners.has(selectedContact.id)) {
                    const directListener = window._matrixDirectListeners.get(selectedContact.id);
                    client.removeListener('Room.timeline', directListener);
                    window._matrixDirectListeners.delete(selectedContact.id);
                  }

                  // Remove any room-level listeners
                  const room = client.getRoom(selectedContact.id);
                  if (room && window._matrixRoomListeners && window._matrixRoomListeners.has(selectedContact.id)) {
                    const roomListener = window._matrixRoomListeners.get(selectedContact.id);
                    room.removeListener('Room.timeline', roomListener);
                    window._matrixRoomListeners.delete(selectedContact.id);
                  }
                } catch (listenerError) {
                  logger.warn(`[TelegramChatView] Manual Refresh: Error removing listeners: ${listenerError.message}`);
                }

                // Step 4: Attempt to fetch initial messages for the room with increased limit
                logger.info('[TelegramChatView] Manual Refresh: Attempting roomInitialSync with increased limit.');
                try {
                    if (typeof client.roomInitialSync === 'function') {
                        // INCREASED LIMIT HERE
                        await client.roomInitialSync(selectedContact.id, 200); // Fetch a larger chunk (e.g., 200)
                    }
                } catch (roomSyncError) {
                    logger.warn(`[TelegramChatView] Manual Refresh: roomInitialSync error (continuing): ${roomSyncError.message}`);
                }

                // Step 5: Another sync poke and a short delay to allow SDK to settle
                logger.info('[TelegramChatView] Manual Refresh: Final sync poke and delay before fetching timeline.');
                if (typeof client.retryImmediately === 'function') {
                  client.retryImmediately();
                }
                await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5-second delay for better settling

                // Step 6: Primary strategy: Use MatrixTimelineManager to load messages with forceRefresh
                logger.info('[TelegramChatView] Manual Refresh: Attempting to load messages via MatrixTimelineManager with forceRefresh.');

                // Ensure MatrixTimelineManager is initialized
                if (!matrixTimelineManager.initialized && client) {
                  logger.info('[TelegramChatView] Manual Refresh: Initializing MatrixTimelineManager.');
                  matrixTimelineManager.initialize(client);
                } else if (matrixTimelineManager.initialized && matrixTimelineManager.client !== client) {
                  // Re-initialize if the client has changed
                  logger.info('[TelegramChatView] Manual Refresh: Re-initializing MatrixTimelineManager with current client.');
                  matrixTimelineManager.initialize(client);
                }

                // CRITICAL FIX: Clear the message cache for this room to force a fresh load
                if (matrixTimelineManager.messageCache && matrixTimelineManager.messageCache.has(selectedContact.id)) {
                  matrixTimelineManager.messageCache.delete(selectedContact.id);
                  logger.info(`[TelegramChatView] Manual Refresh: Cleared message cache for room ${selectedContact.id}`);
                }

                let refreshedMessages = await matrixTimelineManager.loadMessages(selectedContact.id, {
                  limit: 150, // Increased limit for better coverage
                  forceRefresh: true
                });

                if (refreshedMessages && refreshedMessages.length > 0) {
                  logger.info(`[TelegramChatView] Manual Refresh: Loaded ${refreshedMessages.length} messages via MatrixTimelineManager.`);
                  // DEBUG: Log processed message details from manager
                  refreshedMessages.slice(-10).forEach(msg => { // Log last 10 messages
                      logger.info(`[TelegramChatView] Manual Refresh MTM - Message: ID=${msg.id}, TS=${msg.timestamp}, Body='${msg.body?.substring(0,30)}...'`);
                  });
                  setMessages(refreshedMessages.sort((a, b) => a.timestamp - b.timestamp));
                  toast.success(`Refreshed. Found ${refreshedMessages.length} messages.`, { id: refreshToastId });
                  eventCounterRef.current = refreshedMessages.length; // Update based on what manager returned

                } else {
                  logger.info('[TelegramChatView] Manual Refresh: MatrixTimelineManager returned no messages. Attempting direct timeline read as fallback.');
                  // Fallback to direct timeline read if manager fails
                  const room = client.getRoom(selectedContact.id);
                  if (!room) {
                    logger.error(`[TelegramChatView] Manual Refresh Fallback: Room not found: ${selectedContact.id}`);
                    toast.error('Room not found for fallback.', { id: refreshToastId });
                    // setMessages([]); // Already cleared
                    return; // Exit if room not found for fallback
                  }
                  const liveTimeline = room.getLiveTimeline();
                  if (!liveTimeline) {
                      logger.error(`[TelegramChatView] Manual Refresh Fallback: Could not get live timeline for room: ${selectedContact.id}`);
                      toast.error('Could not get room timeline for fallback.', { id: refreshToastId });
                      // setMessages([]); // Already cleared
                      return; // Exit if no timeline for fallback
                  }
                  const events = liveTimeline.getEvents();
                  logger.info(`[TelegramChatView] Manual Refresh Fallback: Found ${events.length} events in live timeline.`);
                  const directMessages = [];
                  const currentProcessedIds = new Set();
                  const sortedEvents = [...events].sort((a, b) => b.getTs() - a.getTs());

                  for (const event of sortedEvents) {
                    try {
                      const eventId = event.getId();
                      if (!eventId || currentProcessedIds.has(eventId)) continue;
                      const eventType = event.getType();
                      const relevantTypes = ['m.room.message', 'm.sticker', 'm.room.encrypted', 'm.bridge', 'uk.half-shot.bridge', 'fi.mau.dummy.portal_created'];
                      if (!relevantTypes.includes(eventType)) continue;

                      const currentRoomForProcessing = client.getRoom(selectedContact.id); // Re-fetch for safety, though room should be same
                      if (!currentRoomForProcessing) {
                           logger.warn(`[TelegramChatView] Manual Refresh Fallback: Could not get room object for ${selectedContact.id} for event ${eventId}. Skipping.`);
                           continue;
                      }
                      const message = matrixTimelineManager._createMessageFromEvent(event, currentRoomForProcessing);
                      if (message) {
                          logger.info(`[TelegramChatView] Manual Refresh Fallback - Processed message: ID=${message.id}, TS=${message.timestamp}, Body='${message.body?.substring(0, 30)}...'`);
                          directMessages.push(message);
                          currentProcessedIds.add(eventId);
                      } else {
                          logger.warn(`[TelegramChatView] Manual Refresh Fallback: _createMessageFromEvent returned null for event ${eventId}.`);
                      }
                    } catch (eventError) {
                      logger.warn(`[TelegramChatView] Manual Refresh Fallback: Error processing event: ${eventError.message}`, eventError);
                    }
                  }
                  directMessages.sort((a, b) => a.timestamp - b.timestamp);
                  setMessages(directMessages);
                  if (directMessages.length > 0) {
                    toast.success(`Refreshed (fallback). Found ${directMessages.length} messages.`, { id: refreshToastId });
                  } else {
                    toast.success('Refreshed. Still no new messages.', { id: refreshToastId });
                  }
                  eventCounterRef.current = events.length;
                }

                // CRITICAL FIX: Update timestamp and set up real-time updates with proper cleanup
                lastMessageTimestampRef.current = Date.now();

                // Set up real-time updates with our enhanced implementation
                logger.info('[TelegramChatView] Manual Refresh: Setting up real-time updates after refresh');
                const setupSuccess = setupRealTimeUpdates(selectedContact.id);

                if (setupSuccess) {
                  logger.info('[TelegramChatView] Manual Refresh: Successfully set up real-time updates');
                } else {
                  logger.warn('[TelegramChatView] Manual Refresh: Failed to set up real-time updates');
                }

                // Force a final check for new messages after a short delay
                setTimeout(() => {
                  try {
                    const room = client.getRoom(selectedContact.id);
                    if (room) {
                      const liveTimeline = room.getLiveTimeline();
                      if (liveTimeline) {
                        const events = liveTimeline.getEvents();
                        logger.info(`[TelegramChatView] Manual Refresh: Final check shows ${events.length} events in timeline`);
                      }
                    }
                  } catch (error) {
                    logger.warn(`[TelegramChatView] Manual Refresh: Error in final timeline check: ${error.message}`);
                  }
                }, 2000);

              } catch (error) {
                logger.error('[TelegramChatView] Manual Refresh: Error during refresh process:', error);
                toast.error(`Refresh failed: ${error.message}`, { id: refreshToastId });
                // Optionally, try to load cached messages or existing messages as a fallback
                // loadMessages(); // This might load older cached messages
              }
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

          {/* AI Assistant button */}
          <AIAssistantButton
            client={client}
            selectedContact={selectedContact}
            className="bg-[#0088CC] hover:bg-[#0077BB] ai-assistant-button"
          />

          {/* Help/Tour button */}
          <button
            onClick={() => setShowAITour(true)}
            className="p-2 rounded-full bg-[#0088CC] text-white hover:bg-[#0077BB] transition-colors relative overflow-visible"
            title="Take AI Assistant Tour"
          >
            <FiHelpCircle className="w-4 h-4" />
            <span className="absolute inset-0 rounded-full bg-white/20 animate-ping"></span>
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
      <div
        id="messages-container"
        className="messages-container flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-neutral-900 to-neutral-950"
        onScroll={handleScroll}
      >
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

            {/* Group messages by date and add date separators */}
            {(() => {
              // Filter out "Message content unavailable" messages
              const filteredMessages = messages.filter(message =>
                !(message.content?.body === 'Message content unavailable' ||
                  message.body === 'Message content unavailable')
              );

              // Group messages by date
              const messagesByDate = {};
              filteredMessages.forEach(message => {
                // Ensure timestamp is a number
                const timestamp = typeof message.timestamp === 'number' ?
                  message.timestamp :
                  new Date(message.timestamp).getTime();

                // Create date string using the timestamp
                const date = new Date(timestamp);
                const dateString = date.toDateString();

                if (!messagesByDate[dateString]) {
                  messagesByDate[dateString] = [];
                }
                messagesByDate[dateString].push({
                  ...message,
                  timestamp: timestamp // Ensure consistent timestamp format
                });
              });

              // Render messages with date separators
              return Object.entries(messagesByDate)
                .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
                .map(([dateString, messagesForDate]) => {
                  // Sort messages within each date group by timestamp
                  const sortedMessages = messagesForDate.sort((a, b) => a.timestamp - b.timestamp);

                  return (
                    <React.Fragment key={dateString}>
                      <DateSeparator date={new Date(dateString)} />
                      {sortedMessages.map((message, index) => (
                        <div
                          key={message.id || `${dateString}-${index}`}
                          className={`message-container ${message.isFromMe ? 'message-container-sent' : 'message-container-received'} group`}
                        >
                          {/* Avatar for received messages */}
                          {!message.isFromMe && (
                            <div className="message-avatar message-avatar-received">
                    {message.sender && message.sender.includes('telegram_') && message.content && message.content.sender_avatar ? (
                      // If we have a sender avatar URL, use it
                      <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-transparent hover:border-[#0088cc] transition-colors">
                        <img
                          src={getFallbackAvatarUrl(message.senderName || 'T', '#0088cc')}
                          data-mxc-url={message.content.sender_avatar}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                          onLoad={(e) => {
                            // If this is a fallback avatar and we have a real avatar URL, load it asynchronously
                            if (message.content.sender_avatar && client && e.target.src.startsWith('data:')) {
                              (async () => {
                                try {
                                  // We need to use the synchronous version for now since we haven't updated all callers
                                  // In a future update, we should make getMediaUrl fully async
                                  const mediaUrl = getMediaUrl(client, message.content.sender_avatar, {
                                    type: 'thumbnail',
                                    width: 80,
                                    height: 80,
                                    method: 'crop',
                                    fallbackUrl: getFallbackAvatarUrl(message.senderName || 'T', '#0088cc')
                                  });
                                  if (mediaUrl && !mediaUrl.startsWith('data:')) {
                                    e.target.src = mediaUrl;
                                  }
                                } catch (error) {
                                  logger.warn('[TelegramChatView] Error loading avatar:', error);
                                }
                              })();
                            }
                          }}
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

                          {/* Message bubble with action wheel - don't show action wheel for welcome messages */}
                          {message.id && message.id.startsWith('welcome-') ? (
                            <div className="message-bubble message-bubble-received">
                              <div className="message-content">
                                {message.content && message.content.body ? message.content.body : 'Welcome message'}
                              </div>
                              <div className="message-timestamp message-timestamp-received">
                                <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          ) : (
                            <MessageBubbleWithWheel
                              message={message}
                              client={client}
                              selectedContact={selectedContact}
                              parentEvents={parentEvents}
                              onReply={handleReplyToMessage}
                              onDelete={() => toast.error('Delete functionality coming soon')}
                              onPin={() => toast.error('Pin functionality coming soon')}
                              onReact={() => toast.error('React functionality coming soon')}
                            />
                )}
                          <div className="hidden">
                            {/* Sender name - Hidden but kept for reference */}
                            {!message.isFromMe && (
                              <div className="text-xs font-medium text-blue-300 mb-1">
                                {(() => {
                                  // First check if we have a senderName in the message object
                                  // This would have been set by matrixTimelineManager._createMessageFromEvent
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
                                            logger.warn('[TelegramChatView] Error getting state events:', error);
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
                                            logger.warn('[TelegramChatView] Error getting member state:', error);
                                          }
                                        }

                                      // Try to get the name from the message content
                                      if (message.content && message.content.sender_name) {
                                        return message.content.sender_name;
                                      }

                                      // If we still don't have a name, use a friendly Telegram user name
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
                          <div className="message-avatar message-avatar-sent">
                            {client?.getUserId() ? client.getUserId().charAt(0).toUpperCase() : 'Me'}
                          </div>
                        )}
                      </div>
                            ))}
                            </React.Fragment>
                          );
                        })
                    })()}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* AI Action Buttons */}
      {client && selectedContact && !selectedContact.isPlaceholder && (
        <div className="px-3 pt-3">
          <AIActionButtons
            roomId={selectedContact.id}
            client={client}
            messages={messages}
          />
        </div>
      )}

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
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex space-x-4">
            {/* <button
              type="button"
              className="text-gray-400 bg-neutral-800 hover:text-[#0088cc] transition-colors p-1 rounded-full hover:bg-neutral-800"
              title="Attach files"
            >
              <FiPaperclip className="w-5 h-5" />
            </button> */}
            {/* <button
              type="button"
              className="text-gray-400 bg-neutral-800 hover:text-[#0088cc] transition-colors p-1 rounded-full hover:bg-neutral-800"
              title="Send images"
            >
              <FiImage className="w-5 h-5" />
            </button> */}
            {/* AI Assistant Button */}
            <div className="ai-button-container ml-10 relative">
              <AIAssistantButton
                client={client}
                selectedContact={selectedContact}
                className="bg-neutral-800 hover:bg-[#0088CC]/20 ai-assistant-button-composer"
              />
            </div>
          </div>
          <div>
            {/* <button
              type="button"
              className="text-gray-400 bg-neutral-800 hover:text-[#0088cc] transition-colors p-1 rounded-full hover:bg-neutral-800"
              title="Format text"
            >
              <span className="font-bold text-sm">Aa</span>
            </button> */}
          </div>
        </div>

        {/* Message composer */}
        {/* <form onSubmit={handleSendMessage} className="flex items-center">
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
              id="message-input"
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
        </form> */}
      </div>
    </div>
  );
};

TelegramChatView.propTypes = {
  selectedContact: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    avatar: PropTypes.string,
    isGroup: PropTypes.bool,
    members: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    isPlaceholder: PropTypes.bool
  })
};

export default TelegramChatView;

