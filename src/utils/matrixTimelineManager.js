/**
 * Matrix Timeline Manager
 *
 * A comprehensive utility for managing Matrix room timelines, messages, and members.
 * Based on Element's implementation for reliable message loading and display.
 */

import logger from './logger';
import cacheManager from './cacheManager';

// Constants
const DEFAULT_LIMIT = 100; // Increased from 50 to ensure we get more messages
const PAGINATION_DIRECTION = {
  BACKWARD: 'b',
  FORWARD: 'f'
};

// Cache settings
const USE_CACHE = true; // Set to false to disable caching
const CACHE_FIRST = true; // Try cache first, then network

class MatrixTimelineManager {
  constructor() {
    this.initialized = false;
    this.client = null;
    this.roomTimelines = new Map(); // Map of roomId -> timeline data
    this.roomMembers = new Map(); // Map of roomId -> member data
    this.eventListeners = new Map(); // Map of roomId -> event listeners
  }

  /**
   * Initialize the timeline manager with a Matrix client
   * @param {Object} client - Matrix client instance
   * @returns {boolean} - Whether initialization was successful
   */
  initialize(client) {
    if (!client) {
      logger.error('[MatrixTimelineManager] Cannot initialize: No Matrix client provided');
      return false;
    }

    this.client = client;
    this.initialized = true;

    // Set up global event listeners
    this.setupGlobalEventListeners();

    logger.info('[MatrixTimelineManager] Initialized successfully');
    return true;
  }

  /**
   * Set up global event listeners for all rooms
   */
  setupGlobalEventListeners() {
    if (!this.client) return;

    // Listen for timeline events
    this.client.on('Room.timeline', this.handleRoomTimeline.bind(this));

    // Listen for membership changes
    this.client.on('RoomMember.membership', this.handleMembershipChange.bind(this));

    // Listen for room state changes
    this.client.on('RoomState.events', this.handleRoomStateEvent.bind(this));
  }

  /**
   * Handle Room.timeline events
   * @param {Object} event - Matrix event
   * @param {Object} room - Matrix room
   * @param {boolean} toStartOfTimeline - Whether event is being added to start of timeline
   * @param {boolean} removed - Whether the event was removed
   * @param {Object} data - Additional data
   */
  handleRoomTimeline(event, room, toStartOfTimeline, removed, data) {
    if (!room || !event) return;

    const roomId = room.roomId;
    const eventType = event.getType();

    logger.debug(`[MatrixTimelineManager] Timeline event in room ${roomId}: ${eventType}`);

    // Update room timeline data
    const timelineData = this.roomTimelines.get(roomId) || { events: [], hasMore: true };

    // Don't add duplicates
    if (!removed && !timelineData.events.some(e => e.getId() === event.getId())) {
      // Add to beginning or end based on direction
      if (toStartOfTimeline) {
        timelineData.events.unshift(event);
      } else {
        timelineData.events.push(event);
      }

      // Sort by timestamp
      timelineData.events.sort((a, b) => a.getTs() - b.getTs());

      // Update the timeline data
      this.roomTimelines.set(roomId, timelineData);

      // Emit event to any room-specific listeners
      const listeners = this.eventListeners.get(roomId) || [];
      listeners.forEach(listener => {
        if (listener.event === 'timeline' && typeof listener.callback === 'function') {
          listener.callback(event, room, toStartOfTimeline, removed, data);
        }
      });
    }
  }

  /**
   * Handle membership changes
   * @param {Object} event - Matrix event
   * @param {Object} member - Room member
   * @param {string} oldMembership - Previous membership state
   */
  handleMembershipChange(event, member, oldMembership) {
    if (!member || !member.roomId) return;

    const roomId = member.roomId;
    logger.debug(`[MatrixTimelineManager] Membership change in room ${roomId} for ${member.userId}: ${oldMembership} -> ${member.membership}`);

    // Update room members cache
    this.updateRoomMembers(roomId);

    // Emit event to any room-specific listeners
    const listeners = this.eventListeners.get(roomId) || [];
    listeners.forEach(listener => {
      if (listener.event === 'membership' && typeof listener.callback === 'function') {
        listener.callback(event, member, oldMembership);
      }
    });
  }

  /**
   * Handle room state events
   * @param {Object} event - Matrix event
   * @param {Object} state - Room state
   */
  handleRoomStateEvent(event, state) {
    if (!state || !state.roomId) return;

    const roomId = state.roomId;
    const eventType = event.getType();

    logger.debug(`[MatrixTimelineManager] State event in room ${roomId}: ${eventType}`);

    // Update room members if it's a membership event
    if (eventType === 'm.room.member') {
      this.updateRoomMembers(roomId);
    }

    // Emit event to any room-specific listeners
    const listeners = this.eventListeners.get(roomId) || [];
    listeners.forEach(listener => {
      if (listener.event === 'state' && typeof listener.callback === 'function') {
        listener.callback(event, state);
      }
    });
  }

  /**
   * Load messages for a room using multiple strategies for reliability
   * @param {string} roomId - Room ID
   * @param {Object} options - Options for loading messages
   * @param {number} options.limit - Maximum number of messages to load
   * @param {string} options.direction - Direction to load messages ('b' for backwards, 'f' for forwards)
   * @param {string} options.from - Token to start loading from
   * @param {boolean} options.forceRefresh - Force refresh from server
   * @returns {Promise<Array>} - Array of processed messages
   */
  async loadMessages(roomId, options = {}) {
    if (!this.initialized || !this.client) {
      logger.error('[MatrixTimelineManager] Cannot load messages: Not initialized');
      return [];
    }

    const {
      limit = DEFAULT_LIMIT,
      direction = PAGINATION_DIRECTION.BACKWARD,
      from = null,
      forceRefresh = false
    } = options;

    logger.info(`[MatrixTimelineManager] Loading messages for room ${roomId}`);

    try {
      // Try to get messages from cache first if not forcing refresh
      if (USE_CACHE && !forceRefresh && CACHE_FIRST) {
        try {
          const cachedMessages = await cacheManager.getCachedMessages(roomId, {
            limit,
            before: Date.now()
          });

          if (cachedMessages && cachedMessages.length > 0) {
            logger.info(`[MatrixTimelineManager] Using ${cachedMessages.length} cached messages for room ${roomId}`);
            return cachedMessages;
          }
        } catch (cacheError) {
          logger.warn('[MatrixTimelineManager] Error retrieving cached messages:', cacheError);
          // Continue with network loading if cache fails
        }
      }

      // Get the room
      const room = this.client.getRoom(roomId);
      if (!room) {
        logger.error(`[MatrixTimelineManager] Room ${roomId} not found`);
        return [];
      }

      // Multi-layered approach to message loading
      let loadedEvents = [];
      let loadingMethod = '';

      // 1. Try to use the room's timeline first
      try {
        logger.info(`[MatrixTimelineManager] Attempting to load messages from room timeline`);

        // Force a sync first if requested
        if (forceRefresh) {
          try {
            // Try to force a sync to get the latest messages
            await this.client.roomInitialSync(roomId, 100);
            logger.info(`[MatrixTimelineManager] Forced room initial sync for ${roomId}`);
          } catch (syncError) {
            logger.warn('[MatrixTimelineManager] Error forcing room initial sync:', syncError);
          }
        }

        // Get the timeline
        const timeline = room.getLiveTimeline();
        if (timeline) {
          // Get events from the timeline
          let events = timeline.getEvents();
          logger.info(`[MatrixTimelineManager] Initial timeline has ${events.length} events`);

          // If we have very few events, try to load more
          if (events.length < limit) {
            try {
              // Try to paginate the timeline
              if (this.client.paginateEventTimeline) {
                await this.client.paginateEventTimeline(timeline, { backwards: direction === 'b', limit });
                events = timeline.getEvents();

                // Add isLiveEvent function to events if it doesn't exist
                events = events.map(event => {
                  if (typeof event.isLiveEvent !== 'function') {
                    event.isLiveEvent = () => false;
                  }
                  return event;
                });

                logger.info(`[MatrixTimelineManager] After pagination: ${events.length} events`);
              }
            } catch (paginationError) {
              logger.warn('[MatrixTimelineManager] Error paginating timeline:', paginationError);
            }
          }

          if (events.length > 0) {
            loadedEvents = events;
            loadingMethod = 'room timeline';
          }
        }
      } catch (timelineError) {
        logger.warn('[MatrixTimelineManager] Error loading from timeline:', timelineError);
      }

      // 2. Always try direct Matrix API to ensure we get the most recent messages
      try {
        logger.info(`[MatrixTimelineManager] Loading messages with direct Matrix API to ensure we get the most recent ones`);

        // Use roomMessages API to get historical messages
        if (this.client.roomMessages) {
          // First try to get the most recent messages with a null token (from the present)
          const recentMessageResponse = await this.client.roomMessages(roomId, null, limit * 2, 'b');

          if (recentMessageResponse && recentMessageResponse.chunk && recentMessageResponse.chunk.length > 0) {
            logger.info(`[MatrixTimelineManager] Loaded ${recentMessageResponse.chunk.length} recent messages from roomMessages API`);

            // Process the events to ensure they're in the right format
            const processedEvents = recentMessageResponse.chunk.map(event => {
              // Add isLiveEvent function if it doesn't exist
              if (typeof event.isLiveEvent !== 'function') {
                event.isLiveEvent = () => true;
              }
              return event;
            });

            // Merge with existing events, avoiding duplicates
            if (loadedEvents.length > 0) {
              const existingEventIds = new Set(loadedEvents.map(e => {
                return typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
              }).filter(Boolean));

              const newEvents = processedEvents.filter(e => {
                const eventId = typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
                return eventId && !existingEventIds.has(eventId);
              });

              loadedEvents = [...loadedEvents, ...newEvents];
            } else {
              loadedEvents = processedEvents;
            }

            loadingMethod = loadingMethod ? `${loadingMethod} + roomMessages API` : 'roomMessages API';
          }

          // 3. Try a second approach to get the absolute latest messages
          try {
            // Use the sync API to get the absolute latest messages
            const syncResponse = await this.client.roomInitialSync(roomId, 100);

            if (syncResponse && syncResponse.messages && syncResponse.messages.chunk && syncResponse.messages.chunk.length > 0) {
              logger.info(`[MatrixTimelineManager] Loaded ${syncResponse.messages.chunk.length} messages from roomInitialSync`);

              // Process the events
              const syncEvents = syncResponse.messages.chunk.map(event => {
                if (typeof event.isLiveEvent !== 'function') {
                  event.isLiveEvent = () => true;
                }
                return event;
              });

              // Merge with existing events, avoiding duplicates
              const existingEventIds = new Set(loadedEvents.map(e => {
                return typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
              }).filter(Boolean));

              const newSyncEvents = syncEvents.filter(e => {
                const eventId = typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
                return eventId && !existingEventIds.has(eventId);
              });

              if (newSyncEvents.length > 0) {
                logger.info(`[MatrixTimelineManager] Adding ${newSyncEvents.length} new messages from roomInitialSync`);
                loadedEvents = [...loadedEvents, ...newSyncEvents];
                loadingMethod += ' + roomInitialSync';
              }
            }
          } catch (syncError) {
            logger.warn('[MatrixTimelineManager] Error loading messages with roomInitialSync:', syncError);
          }

          // 4. If we have a 'from' token and need more messages, try to load older ones too
          if (from && loadedEvents.length < limit * 1.5) {
            try {
              const olderMessageResponse = await this.client.roomMessages(roomId, from, limit, direction);

              if (olderMessageResponse && olderMessageResponse.chunk && olderMessageResponse.chunk.length > 0) {
                logger.info(`[MatrixTimelineManager] Loaded ${olderMessageResponse.chunk.length} older messages from roomMessages API`);

                // Process the events
                const processedOlderEvents = olderMessageResponse.chunk.map(event => {
                  if (typeof event.isLiveEvent !== 'function') {
                    event.isLiveEvent = () => false;
                  }
                  return event;
                });

                // Merge with existing events, avoiding duplicates
                const existingEventIds = new Set(loadedEvents.map(e => {
                  return typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
                }).filter(Boolean));

                const newOlderEvents = processedOlderEvents.filter(e => {
                  const eventId = typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
                  return eventId && !existingEventIds.has(eventId);
                });

                loadedEvents = [...loadedEvents, ...newOlderEvents];
                loadingMethod += ' + older messages';
              }
            } catch (olderApiError) {
              logger.warn('[MatrixTimelineManager] Error loading older messages:', olderApiError);
            }
          }
        }
      } catch (apiError) {
        logger.warn('[MatrixTimelineManager] Error loading messages with direct Matrix API:', apiError);
      }

      // 3. Try to fetch related events if we found any reactions
      if (loadedEvents.length > 0) {
        try {
          logger.info(`[MatrixTimelineManager] Looking for related events`);

          // Look for reaction events
          const reactionEvents = loadedEvents.filter(event => {
            const eventType = typeof event.getType === 'function' ? event.getType() : event.type;
            return eventType === 'm.reaction' ||
                  (event.content && event.content['m.relates_to'] &&
                   event.content['m.relates_to'].rel_type === 'm.annotation');
          });

          logger.info(`[MatrixTimelineManager] Found ${reactionEvents.length} reaction events`);

          // Extract related event IDs
          const relatedEventIds = new Set();
          reactionEvents.forEach(event => {
            const content = typeof event.getContent === 'function' ? event.getContent() : event.content;
            if (content && content['m.relates_to'] && content['m.relates_to'].event_id) {
              relatedEventIds.add(content['m.relates_to'].event_id);
            }
          });

          logger.info(`[MatrixTimelineManager] Found ${relatedEventIds.size} related event IDs`);

          // Try to fetch these events
          if (relatedEventIds.size > 0 && this.client.getEvent) {
            const fetchedEvents = [];

            for (const eventId of relatedEventIds) {
              try {
                const event = await this.client.getEvent(roomId, eventId);
                if (event) {
                  fetchedEvents.push(event);
                }
              } catch (fetchError) {
                logger.warn(`[MatrixTimelineManager] Error fetching event ${eventId}:`, fetchError);
              }
            }

            logger.info(`[MatrixTimelineManager] Fetched ${fetchedEvents.length} related events`);

            // Merge with existing events, avoiding duplicates
            if (fetchedEvents.length > 0) {
              const existingEventIds = new Set(loadedEvents.map(e => {
                return typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
              }).filter(Boolean));

              const newEvents = fetchedEvents.filter(e => {
                const eventId = typeof e.getId === 'function' ? e.getId() : (e.event_id || e.id);
                return eventId && !existingEventIds.has(eventId);
              });

              loadedEvents = [...loadedEvents, ...newEvents];
              loadingMethod += ' + related events';
            }
          }
        } catch (relatedError) {
          logger.warn('[MatrixTimelineManager] Error finding related events:', relatedError);
        }
      }

      // Cache the timeline data
      this.roomTimelines.set(roomId, {
        events: loadedEvents,
        hasMore: true,
        lastUpdated: Date.now()
      });

      // Process events into messages
      const messages = await this.processEventsToMessages(loadedEvents);

      // Sort messages by timestamp to ensure correct order
      const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);

      logger.info(`[MatrixTimelineManager] Successfully loaded ${sortedMessages.length} messages using ${loadingMethod}`);

      // Cache the messages for future use
      if (USE_CACHE && sortedMessages.length > 0) {
        try {
          // Create a safe copy of the messages to avoid serialization issues
          const messagesToCache = sortedMessages.map(msg => ({
            ...msg,
            // Remove any potential circular references or functions
            _matrixEvent: undefined,
            _room: undefined
          }));

          await cacheManager.cacheMessages(messagesToCache, roomId);
          logger.info(`[MatrixTimelineManager] Cached ${messagesToCache.length} messages for room ${roomId}`);
        } catch (cacheError) {
          logger.warn('[MatrixTimelineManager] Error caching messages:', cacheError);
          // Continue even if caching fails
        }
      }

      return sortedMessages;
    } catch (error) {
      logger.error('[MatrixTimelineManager] Error loading messages:', error);
      return [];
    }
  }

  /**
   * Create a message object from a Matrix event
   * @param {Object} event - Matrix event
   * @param {Object} room - Matrix room
   * @returns {Object} - Message object
   * @private
   */
  _createMessageFromEvent(event, room) {
    try {
      // Skip null or undefined events
      if (!event) return null;

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

      // Get sender display name from room state
      let senderName = sender;
      if (room) {
        try {
          // First try to get from room member
          const member = room.getMember(sender);
          if (member && member.name) {
            senderName = member.name;
          } else {
            // If that fails, try to get from room state
            if (room.currentState) {
              const stateEvents = room.currentState.getStateEvents('m.room.member');
              for (const stateEvent of stateEvents) {
                const stateKey = typeof stateEvent.getStateKey === 'function' ? stateEvent.getStateKey() : stateEvent.state_key;
                const stateContent = typeof stateEvent.getContent === 'function' ? stateEvent.getContent() : stateEvent.content;

                if (stateKey === sender && stateContent && stateContent.displayname) {
                  senderName = stateContent.displayname;
                  break;
                }
              }
            }
          }

          // If we still have a Matrix ID, try to extract a better name
          if (senderName === sender) {
            // For Telegram users, the format is usually @telegram_123456789:server.org
            if (sender.includes('telegram_')) {
              // Extract the Telegram user ID
              const telegramId = sender.match(/telegram_(\d+)/);
              if (telegramId && telegramId[1]) {
                // Check if we have a better name in the room state
                if (room.currentState) {
                  const stateEvents = room.currentState.getStateEvents('m.room.member');
                  for (const stateEvent of stateEvents) {
                    const stateKey = typeof stateEvent.getStateKey === 'function' ? stateEvent.getStateKey() : stateEvent.state_key;
                    const stateContent = typeof stateEvent.getContent === 'function' ? stateEvent.getContent() : stateEvent.content;

                    if (stateKey === sender && stateContent && stateContent.displayname) {
                      senderName = stateContent.displayname;
                      break;
                    }
                  }
                }

                // If we still don't have a better name, use the Telegram ID
                if (senderName === sender) {
                  senderName = `Telegram User ${telegramId[1]}`;
                }
              }
            } else {
              // For other users, just use the first part of the Matrix ID
              senderName = sender.split(':')[0].replace('@', '');
            }
          }
        } catch (error) {
          logger.warn(`[MatrixTimelineManager] Error getting member name: ${error.message}`);
        }
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

      // If content is empty, try to create a fallback content
      if (!content) {
        content = { body: 'Message content unavailable' };
      }

      // If content doesn't have a body or text, try to extract from other fields
      if (!content.body && !content.text) {
        // For encrypted messages
        if (eventType === 'm.room.encrypted') {
          content.body = 'Encrypted message';
        }
        // For stickers
        else if (eventType === 'm.sticker' && content.url) {
          content.body = 'Sticker';
        }
        // For messages with only msgtype
        else if (content.msgtype) {
          if (content.msgtype === 'm.image') {
            content.body = 'Image';
          } else if (content.msgtype === 'm.file') {
            content.body = 'File';
          } else if (content.msgtype === 'm.audio') {
            content.body = 'Audio';
          } else if (content.msgtype === 'm.video') {
            content.body = 'Video';
          } else {
            content.body = 'Message';
          }
        }
        // Default fallback
        else {
          content.body = 'Message';
        }
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
      const isFromMe = this.client && sender === this.client.getUserId();

      // Get room ID
      let roomId = null;
      if (typeof event.getRoomId === 'function') {
        roomId = event.getRoomId();
      } else if (event.room_id) {
        roomId = event.room_id;
      } else if (room && room.roomId) {
        roomId = room.roomId;
      }

      // Check if the message is a reply
      let replyToEventId = null;
      let replyToSender = null;
      let replyToBody = null;

      if (content && content['m.relates_to'] && content['m.relates_to']['m.in_reply_to']) {
        replyToEventId = content['m.relates_to']['m.in_reply_to'].event_id;
      }

      // Create message object
      return {
        id,
        eventType,
        sender,
        senderName,
        body: content.body || content.text || '',
        timestamp,
        isFromMe,
        roomId,
        replyToEventId,
        replyToSender,
        replyToBody,
        rawEvent: event,
        content
      };
    } catch (error) {
      logger.warn('[MatrixTimelineManager] Error creating message from event:', error);

      // Return a fallback message
      return {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        eventType: 'unknown',
        sender: 'Unknown',
        senderName: 'Unknown',
        body: 'Error processing message',
        timestamp: Date.now(),
        isFromMe: false,
        roomId: null,
        rawEvent: event,
        content: {}
      };
    }
  }

  /**
   * Process Matrix events into message objects
   * @param {Array} events - Matrix events
   * @returns {Promise<Array>} - Array of processed messages
   */
  async processEventsToMessages(events) {
    if (!events || !Array.isArray(events) || events.length === 0) {
      return [];
    }

    logger.info(`[MatrixTimelineManager] Processing ${events.length} events into messages`);

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

        // Skip if not a message event or other displayable event
        const displayableEventTypes = ['m.room.message', 'm.room.encrypted', 'm.sticker'];
        if (!displayableEventTypes.includes(eventType)) {
          // Log skipped event types for debugging
          logger.debug(`[MatrixTimelineManager] Skipping event of type: ${eventType}`);
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

        // If content is empty, try to create a fallback content
        if (!content) {
          content = { body: 'Message content unavailable' };
        }

        // If content doesn't have a body or text, try to extract from other fields
        if (!content.body && !content.text) {
          // For encrypted messages
          if (eventType === 'm.room.encrypted') {
            content.body = 'Encrypted message';
          }
          // For stickers
          else if (eventType === 'm.sticker' && content.url) {
            content.body = 'Sticker';
          }
          // For messages with only msgtype
          else if (content.msgtype) {
            if (content.msgtype === 'm.image') {
              content.body = 'Image';
            } else if (content.msgtype === 'm.file') {
              content.body = 'File';
            } else if (content.msgtype === 'm.audio') {
              content.body = 'Audio';
            } else if (content.msgtype === 'm.video') {
              content.body = 'Video';
            } else {
              content.body = 'Message';
            }
          }
          // Skip if we still don't have content
          else {
            logger.debug(`[MatrixTimelineManager] Skipping message with no body or text: ${JSON.stringify(content)}`);
            continue;
          }
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
        const isFromMe = sender === this.client.getUserId();

        // Get room ID
        let roomId = null;
        if (typeof event.getRoomId === 'function') {
          roomId = event.getRoomId();
        } else if (event.room_id) {
          roomId = event.room_id;
        } else if (event.event && event.event.room_id) {
          roomId = event.event.room_id;
        }

        // Get sender display name
        let senderName = sender;

        // Get the room object if we have a roomId
        let roomObj = null;
        if (roomId && this.client) {
          try {
            roomObj = this.client.getRoom(roomId);

            // Try to get a better sender name from the room
            if (roomObj) {
              try {
                // First try to get from room member
                const member = roomObj.getMember(sender);
                if (member && member.name) {
                  senderName = member.name;
                } else if (roomObj.currentState) {
                  // If that fails, try to get from room state
                  const stateEvents = roomObj.currentState.getStateEvents('m.room.member');
                  for (const stateEvent of stateEvents) {
                    const stateKey = typeof stateEvent.getStateKey === 'function' ? stateEvent.getStateKey() : stateEvent.state_key;
                    const stateContent = typeof stateEvent.getContent === 'function' ? stateEvent.getContent() : stateEvent.content;

                    if (stateKey === sender && stateContent && stateContent.displayname) {
                      senderName = stateContent.displayname;
                      break;
                    }
                  }
                }

                // If we still have a Matrix ID, try to extract a better name
                if (senderName === sender && sender.includes('telegram_')) {
                  // Extract the Telegram user ID
                  const telegramId = sender.match(/telegram_(\d+)/);
                  if (telegramId && telegramId[1]) {
                    senderName = `Telegram User ${telegramId[1]}`;
                  }
                }
              } catch (nameError) {
                logger.warn(`[MatrixTimelineManager] Error getting sender name:`, nameError);
              }
            }
          } catch (roomError) {
            logger.warn(`[MatrixTimelineManager] Error getting room ${roomId}:`, roomError);
          }
        }

        // Check if the message has been read
        let isRead = isFromMe; // Own messages are always considered read

        if (!isFromMe && roomObj) {
          try {
            // Get read receipts for this event
            const readReceipt = roomObj.getReceiptsForEvent(event)?.find(receipt =>
              receipt.type === 'm.read' && receipt.userId === this.client.getUserId()
            );

            isRead = !!readReceipt;
          } catch (error) {
            logger.warn(`[MatrixTimelineManager] Error checking read receipt:`, error);
            isRead = false;
          }
        }

        // Add to messages array
        messages.push({
          id,
          sender,
          senderName,
          content,
          timestamp,
          isFromMe,
          isRead,
          eventType,
          roomId,
          rawEvent: event // Store the raw event for reference
        });

        // Mark as processed
        processedEventIds.add(id);
      } catch (error) {
        logger.warn(`[MatrixTimelineManager] Error processing event:`, error);
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
        logger.warn(`[MatrixTimelineManager] Error processing reaction:`, error);
      }
    }

    // Sort messages by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp);

    logger.info(`[MatrixTimelineManager] Processed ${messages.length} messages from ${events.length} events`);
    return messages;
  }

  /**
   * Load room members
   * @param {string} roomId - Room ID
   * @param {Object} options - Options for loading members
   * @param {boolean} options.forceRefresh - Whether to force a refresh from the server
   * @returns {Promise<Array>} - Array of room members
   */
  async loadRoomMembers(roomId, options = {}) {
    if (!this.initialized || !this.client) {
      logger.error('[MatrixTimelineManager] Cannot load room members: Not initialized');
      return { joined: [], invited: [] };
    }

    const { forceRefresh = false } = options;

    logger.info(`[MatrixTimelineManager] Loading members for room ${roomId}`);

    try {
      // Check cache first unless force refresh
      if (!forceRefresh) {
        const cachedMembers = this.roomMembers.get(roomId);
        if (cachedMembers && cachedMembers.lastUpdated > Date.now() - 60000) { // 1 minute cache
          logger.info(`[MatrixTimelineManager] Using cached members for room ${roomId}`);
          return cachedMembers.members;
        }
      }

      // Get the room
      const room = this.client.getRoom(roomId);
      if (!room) {
        logger.error(`[MatrixTimelineManager] Room ${roomId} not found`);
        return { joined: [], invited: [] };
      }

      // Get all members from the room
      let roomMembers = [];

      // First try to get joined members
      try {
        roomMembers = room.getJoinedMembers();
        logger.info(`[MatrixTimelineManager] Loaded ${roomMembers.length} joined members`);
      } catch (e) {
        logger.warn(`[MatrixTimelineManager] Error getting joined members:`, e);
      }

      // If we don't have many members, try to load more from the server
      if (roomMembers.length < 5 || forceRefresh) {
        try {
          // Try to load members directly from the server
          logger.info(`[MatrixTimelineManager] Fetching members from server for room ${roomId}`);
          const response = await this.client.members(roomId);

          if (response && response.chunk) {
            // Process the member events
            const memberEvents = response.chunk.map(this.client.getEventMapper());

            // Add these members to the room state
            memberEvents.forEach(event => {
              const userId = event.getStateKey();
              const content = event.getContent();

              // Only process if we have valid data
              if (userId && content && content.membership) {
                // Create or update the member in the room state
                // Check if setMember function exists before calling it
                if (room.currentState && typeof room.currentState.setMember === 'function') {
                  room.currentState.setMember(userId, event);
                } else {
                  // If setMember is not available, we can't update the room state directly
                  // This is a non-critical error, so we'll just log it and continue
                  logger.debug(`[MatrixTimelineManager] Cannot update member ${userId} in room state: setMember not available`);
                }
              }
            });

            // Get the updated member list
            roomMembers = room.getJoinedMembers();
            logger.info(`[MatrixTimelineManager] Loaded ${roomMembers.length} members after server fetch`);
          }
        } catch (memberError) {
          logger.warn(`[MatrixTimelineManager] Error fetching members from server:`, memberError);
        }
      }

      // Process members into a more usable format
      const processedMembers = {
        joined: [],
        invited: []
      };

      // Process all members
      roomMembers.forEach(member => {
        const memberData = {
          userId: member.userId,
          name: member.name || member.userId,
          avatarUrl: member.getAvatarUrl ? member.getAvatarUrl(this.client.baseUrl, 40, 40, 'crop') : null,
          powerLevel: room.currentState.getMember(member.userId)?.powerLevel || 0,
          membership: member.membership || 'join'
        };

        if (memberData.membership === 'join') {
          processedMembers.joined.push(memberData);
        } else if (memberData.membership === 'invite') {
          processedMembers.invited.push(memberData);
        }
      });

      // Sort members by power level then alphabetically
      const sortMembers = (a, b) => {
        if (a.powerLevel !== b.powerLevel) {
          return b.powerLevel - a.powerLevel; // Higher power levels first
        }
        return a.name.localeCompare(b.name);
      };

      processedMembers.joined.sort(sortMembers);
      processedMembers.invited.sort(sortMembers);

      // Cache the members
      this.roomMembers.set(roomId, {
        members: processedMembers,
        lastUpdated: Date.now()
      });

      logger.info(`[MatrixTimelineManager] Processed ${processedMembers.joined.length} joined and ${processedMembers.invited.length} invited members`);
      return processedMembers;
    } catch (error) {
      logger.error('[MatrixTimelineManager] Error loading room members:', error);
      return { joined: [], invited: [] };
    }
  }

  /**
   * Update room members in cache
   * @param {string} roomId - Room ID
   */
  updateRoomMembers(roomId) {
    // Force a refresh of room members
    this.loadRoomMembers(roomId, { forceRefresh: true })
      .catch(error => {
        logger.error(`[MatrixTimelineManager] Error updating room members for ${roomId}:`, error);
      });
  }

  /**
   * Send a message to a room
   * @param {string} roomId - Room ID
   * @param {string|Object} content - Message content
   * @returns {Promise<string>} - Event ID of the sent message
   */
  async sendMessage(roomId, content) {
    if (!this.initialized || !this.client) {
      logger.error('[MatrixTimelineManager] Cannot send message: Not initialized');
      throw new Error('MatrixTimelineManager not initialized');
    }

    logger.info(`[MatrixTimelineManager] Sending message to room ${roomId}`);

    try {
      let messageContent;

      // Handle different content types
      if (typeof content === 'string') {
        messageContent = {
          msgtype: 'm.text',
          body: content
        };
      } else {
        messageContent = content;
      }

      // Send the message
      const response = await this.client.sendMessage(roomId, null, messageContent);

      logger.info(`[MatrixTimelineManager] Sent message to room ${roomId}: ${response.event_id}`);
      return response.event_id;
    } catch (error) {
      logger.error(`[MatrixTimelineManager] Error sending message to room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Add an event listener for a specific room
   * @param {string} roomId - Room ID
   * @param {string} event - Event name ('timeline', 'membership', 'state')
   * @param {Function} callback - Callback function
   * @returns {string} - Listener ID
   */
  addRoomListener(roomId, event, callback) {
    if (!roomId || !event || typeof callback !== 'function') {
      logger.error('[MatrixTimelineManager] Cannot add room listener: Invalid parameters');
      return null;
    }

    const listenerId = `${roomId}_${event}_${Date.now()}`;
    const listeners = this.eventListeners.get(roomId) || [];

    listeners.push({
      id: listenerId,
      event,
      callback
    });

    this.eventListeners.set(roomId, listeners);

    logger.debug(`[MatrixTimelineManager] Added ${event} listener for room ${roomId}`);
    return listenerId;
  }

  /**
   * Remove an event listener
   * @param {string} roomId - Room ID
   * @param {string} listenerId - Listener ID
   */
  removeRoomListener(roomId, listenerId) {
    if (!roomId || !listenerId) {
      logger.error('[MatrixTimelineManager] Cannot remove room listener: Invalid parameters');
      return;
    }

    const listeners = this.eventListeners.get(roomId) || [];
    const updatedListeners = listeners.filter(listener => listener.id !== listenerId);

    this.eventListeners.set(roomId, updatedListeners);

    logger.debug(`[MatrixTimelineManager] Removed listener ${listenerId} for room ${roomId}`);
  }

  /**
   * Remove all event listeners for a room
   * @param {string} roomId - Room ID
   */
  removeRoomListeners(roomId) {
    if (!roomId) {
      logger.error('[MatrixTimelineManager] Cannot remove room listeners: Invalid roomId');
      return;
    }

    // Clear all listeners for this room
    this.eventListeners.set(roomId, []);

    logger.debug(`[MatrixTimelineManager] Removed all listeners for room ${roomId}`);
  }

  /**
   * Get a parent event for a reply
   * @param {string} roomId - Room ID
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} - Parent event
   */
  async getParentEvent(roomId, eventId) {
    if (!this.initialized || !this.client) {
      logger.error('[MatrixTimelineManager] Cannot get parent event: not initialized');
      return null;
    }

    if (!roomId || !eventId) {
      logger.error('[MatrixTimelineManager] Cannot get parent event: missing roomId or eventId');
      return null;
    }

    try {
      // Get the room
      const room = this.client.getRoom(roomId);
      if (!room) {
        logger.error(`[MatrixTimelineManager] Room not found: ${roomId}`);
        return null;
      }

      logger.info(`[MatrixTimelineManager] Getting parent event ${eventId} for room ${roomId}`);

      // Try multiple approaches to get the event
      let parentEvent = null;

      // Approach 1: Try to get the event from the room's timeline
      try {
        const timelineSet = room.getUnfilteredTimelineSet();
        if (timelineSet) {
          // Try to find the event in the timeline set
          const event = timelineSet.findEventById(eventId);
          if (event) {
            logger.info(`[MatrixTimelineManager] Found parent event ${eventId} in timeline set`);
            parentEvent = event;
          }
        }
      } catch (timelineError) {
        logger.warn(`[MatrixTimelineManager] Error getting event from timeline set: ${timelineError.message}`);
      }

      // Approach 2: Try to get the event from the room's live timeline
      if (!parentEvent) {
        try {
          const timeline = room.getLiveTimeline();
          if (timeline) {
            const events = timeline.getEvents();
            const event = events.find(e => {
              const id = typeof e.getId === 'function' ? e.getId() : e.event_id || e.id;
              return id === eventId;
            });

            if (event) {
              logger.info(`[MatrixTimelineManager] Found parent event ${eventId} in live timeline`);
              parentEvent = event;
            }
          }
        } catch (liveTimelineError) {
          logger.warn(`[MatrixTimelineManager] Error getting event from live timeline: ${liveTimelineError.message}`);
        }
      }

      // Approach 3: Try to use the context API
      if (!parentEvent) {
        try {
          const context = await this.client.getEventContext(roomId, eventId, 1);
          if (context && context.event) {
            logger.info(`[MatrixTimelineManager] Found parent event ${eventId} using context API`);
            parentEvent = context.event;
          }
        } catch (contextError) {
          logger.warn(`[MatrixTimelineManager] Error getting event context: ${contextError.message}`);
        }
      }

      // Approach 4: Try to use the event API directly
      if (!parentEvent) {
        try {
          const event = await this.client.getEvent(roomId, eventId);
          if (event) {
            logger.info(`[MatrixTimelineManager] Found parent event ${eventId} using event API`);
            parentEvent = event;
          }
        } catch (eventError) {
          logger.warn(`[MatrixTimelineManager] Error getting event: ${eventError.message}`);
        }
      }

      // Approach 5: Try to use roomMessages API
      if (!parentEvent) {
        try {
          // Use roomMessages API to get a batch of messages and search for the event
          const response = await this.client.roomMessages(roomId, null, 100, 'b');
          if (response && response.chunk && response.chunk.length > 0) {
            const event = response.chunk.find(e => {
              const id = e.event_id || e.id;
              return id === eventId;
            });

            if (event) {
              logger.info(`[MatrixTimelineManager] Found parent event ${eventId} using roomMessages API`);
              parentEvent = event;
            }
          }
        } catch (messagesError) {
          logger.warn(`[MatrixTimelineManager] Error using roomMessages API: ${messagesError.message}`);
        }
      }

      if (parentEvent) {
        // Process the event to ensure it has all required methods
        if (typeof parentEvent.isLiveEvent !== 'function') {
          parentEvent.isLiveEvent = () => true;
        }

        // Create a message from the event
        const message = this._createMessageFromEvent(parentEvent, room);
        return message;
      }

      logger.warn(`[MatrixTimelineManager] Could not find parent event: ${eventId}`);
      return null;
    } catch (error) {
      logger.error('[MatrixTimelineManager] Error getting parent event:', error);
      return null;
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.client) {
      // Remove global event listeners
      this.client.removeListener('Room.timeline', this.handleRoomTimeline);
      this.client.removeListener('RoomMember.membership', this.handleMembershipChange);
      this.client.removeListener('RoomState.events', this.handleRoomStateEvent);
    }

    // Clear all data
    this.roomTimelines.clear();
    this.roomMembers.clear();
    this.eventListeners.clear();

    this.initialized = false;
    this.client = null;

    logger.info('[MatrixTimelineManager] Cleaned up resources');
  }
}

// Create and export a singleton instance
const matrixTimelineManager = new MatrixTimelineManager();
export default matrixTimelineManager;
