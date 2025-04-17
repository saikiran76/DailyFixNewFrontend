import { EventEmitter } from 'events';
import logger from './logger';

// Constants for sliding sync
const DEFAULT_TIMELINE_LIMIT = 50; // Default number of messages to fetch

/**
 * SlidingSyncManager implements the MSC3575 Sliding Sync protocol for efficient
 * room list and message synchronization. It provides a more efficient way to
 * sync messages compared to traditional sync methods.
 *
 * This is inspired by Element's implementation but simplified for our needs.
 */
class SlidingSyncManager extends EventEmitter {
  constructor() {
    super();
    this.slidingSync = null;
    this.client = null;
    this.initialized = false;
    this.roomSubscriptions = new Map(); // Map of roomId -> subscription info
    this.activeRoomId = null; // Currently active room for focused syncing
    this.syncInProgress = false;
  }

  /**
   * Initialize the SlidingSyncManager with a Matrix client
   * @param {Object} client - Matrix client instance
   * @returns {boolean} - Whether initialization was successful
   */
  initialize(client) {
    if (!client) {
      logger.error('[SlidingSyncManager] Cannot initialize without a Matrix client');
      return false;
    }

    this.client = client;

    // Check if the client supports sliding sync
    if (!this.isSlidingSyncSupported()) {
      logger.warn('[SlidingSyncManager] Sliding sync not supported by this client or homeserver');
      return false;
    }

    logger.info('[SlidingSyncManager] Initialized successfully');
    this.initialized = true;
    return true;
  }

  /**
   * Check if sliding sync is supported by the client
   * @returns {boolean} - Whether sliding sync is supported
   */
  isSlidingSyncSupported() {
    // Check if the client has the necessary methods for sliding sync
    // This is a simplified check - in a real implementation, we would check
    // if the homeserver supports the MSC3575 API

    // First check if the client exists
    if (!this.client) {
      logger.warn('[SlidingSyncManager] No Matrix client provided');
      return false;
    }

    // Check if the client has the createSlidingSync method
    if (typeof this.client.createSlidingSync !== 'function') {
      logger.warn('[SlidingSyncManager] Client does not support createSlidingSync method');
      return false;
    }

    // Check if the homeserver supports sliding sync
    // This would typically involve checking the server's capabilities
    // For now, we'll assume it does if the client has the method

    return true;
  }

  /**
   * Subscribe to a room for efficient message syncing
   * @param {string} roomId - Room ID to subscribe to
   * @param {Object} options - Subscription options
   * @returns {Promise<boolean>} - Whether subscription was successful
   */
  async subscribeToRoom(roomId, options = {}) {
    if (!this.initialized || !this.client) {
      logger.error('[SlidingSyncManager] Cannot subscribe to room, not initialized');
      return false;
    }

    try {
      // Default options
      const subscriptionOptions = {
        timelineLimit: options.timelineLimit || DEFAULT_TIMELINE_LIMIT,
        requiredState: options.requiredState || [
          ['m.room.name', ''],
          ['m.room.topic', ''],
          ['m.room.avatar', ''],
          ['m.room.member', this.client.getUserId()]
        ],
        ...options
      };

      // Create or update subscription
      this.roomSubscriptions.set(roomId, subscriptionOptions);

      // If this is the first subscription, start the sync loop
      if (this.roomSubscriptions.size === 1) {
        this.startSyncLoop();
      }

      // Set as active room for prioritized syncing
      this.activeRoomId = roomId;

      logger.info(`[SlidingSyncManager] Subscribed to room ${roomId}`);
      this.emit('roomSubscribed', roomId);
      return true;
    } catch (error) {
      logger.error(`[SlidingSyncManager] Error subscribing to room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Unsubscribe from a room
   * @param {string} roomId - Room ID to unsubscribe from
   */
  unsubscribeFromRoom(roomId) {
    if (!this.initialized) return;

    this.roomSubscriptions.delete(roomId);

    if (this.activeRoomId === roomId) {
      this.activeRoomId = null;
    }

    logger.info(`[SlidingSyncManager] Unsubscribed from room ${roomId}`);
    this.emit('roomUnsubscribed', roomId);

    // If no more subscriptions, stop the sync loop
    if (this.roomSubscriptions.size === 0) {
      this.stopSyncLoop();
    }
  }

  /**
   * Start the sliding sync loop
   */
  async startSyncLoop() {
    if (this.syncInProgress || !this.initialized) return;

    this.syncInProgress = true;
    logger.info('[SlidingSyncManager] Starting sync loop');

    try {
      // In a real implementation, this would use the sliding sync API
      // For now, we'll simulate it with regular sync methods
      await this.performSync();

      // Schedule the next sync
      this.syncTimer = setTimeout(() => {
        this.syncInProgress = false;
        this.startSyncLoop();
      }, 1000); // 1 second between syncs
    } catch (error) {
      logger.error('[SlidingSyncManager] Error in sync loop:', error);
      this.syncInProgress = false;

      // Retry after a delay
      setTimeout(() => this.startSyncLoop(), 5000);
    }
  }

  /**
   * Stop the sliding sync loop
   */
  stopSyncLoop() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.syncInProgress = false;
    logger.info('[SlidingSyncManager] Stopped sync loop');
  }

  /**
   * Perform a sliding sync operation
   * @returns {Promise<void>}
   */
  async performSync() {
    if (!this.initialized || !this.client) return;

    try {
      // Prioritize the active room
      if (this.activeRoomId) {
        await this.syncRoom(this.activeRoomId);
      }

      // Sync other subscribed rooms
      for (const [roomId, options] of this.roomSubscriptions.entries()) {
        if (roomId !== this.activeRoomId) {
          await this.syncRoom(roomId, options);
        }
      }

      this.emit('syncComplete');
    } catch (error) {
      logger.error('[SlidingSyncManager] Error performing sync:', error);
      this.emit('syncError', error);
      throw error;
    }
  }

  /**
   * Sync a specific room
   * @param {string} roomId - Room ID to sync
   * @param {Object} options - Sync options
   * @returns {Promise<Array>} - Array of timeline events
   */
  async syncRoom(roomId, options = {}) {
    if (!this.initialized || !this.client) return [];

    try {
      const room = this.client.getRoom(roomId);
      if (!room) {
        logger.warn(`[SlidingSyncManager] Room ${roomId} not found`);
        return [];
      }

      // Get subscription options
      const subscriptionOptions = this.roomSubscriptions.get(roomId) || {};
      const timelineLimit = options.timelineLimit || subscriptionOptions.timelineLimit || DEFAULT_TIMELINE_LIMIT;

      // In a real sliding sync implementation, we would use the sliding sync API
      // For now, we'll use a combination of methods to get the best results

      // First try to get messages from the timeline
      let events = [];
      const timeline = room.getLiveTimeline();

      if (timeline) {
        events = timeline.getEvents();
        logger.info(`[SlidingSyncManager] Got ${events.length} events from timeline for room ${roomId}`);

        // If we have very few events, try to load more
        if (events.length < timelineLimit) {
          try {
            // Try to use pagination to get more events
            if (this.client.paginateEventTimeline) {
              const paginationResult = await this.client.paginateEventTimeline(timeline, {
                backwards: true,
                limit: timelineLimit
              });

              if (paginationResult) {
                events = timeline.getEvents();
                logger.info(`[SlidingSyncManager] After pagination: ${events.length} events for room ${roomId}`);
              }
            }

            // If still not enough, try roomMessages API
            if (events.length < timelineLimit && this.client.roomMessages) {
              const messageResponse = await this.client.roomMessages(roomId, null, timelineLimit, 'b');

              if (messageResponse && messageResponse.chunk && messageResponse.chunk.length > 0) {
                // Merge with existing events, avoiding duplicates
                const existingEventIds = new Set(events.map(e => e.getId ? e.getId() : e.event_id));
                const newEvents = messageResponse.chunk.filter(e => {
                  const eventId = e.getId ? e.getId() : e.event_id;
                  return !existingEventIds.has(eventId);
                });

                events = [...events, ...newEvents];
                logger.info(`[SlidingSyncManager] After roomMessages: ${events.length} events for room ${roomId}`);
              }
            }
          } catch (loadError) {
            logger.warn(`[SlidingSyncManager] Error loading more events for room ${roomId}:`, loadError);
          }
        }
      }

      // Process events to extract messages
      const messages = this.processEvents(events, roomId);

      // Emit events
      this.emit('roomSynced', roomId, messages);

      return messages;
    } catch (error) {
      logger.error(`[SlidingSyncManager] Error syncing room ${roomId}:`, error);
      this.emit('roomSyncError', roomId, error);
      return [];
    }
  }

  /**
   * Process timeline events into message objects
   * @param {Array} events - Timeline events
   * @param {string} roomId - Room ID
   * @returns {Array} - Processed messages
   */
  processEvents(events, roomId) {
    if (!events || !events.length) return [];

    const messages = [];
    const userId = this.client.getUserId();

    for (const event of events) {
      try {
        // Check if it's a message event
        const eventType = typeof event.getType === 'function' ? event.getType() :
                         (event.type || (event.content && event.content.msgtype ? 'm.room.message' : null));

        if (eventType === 'm.room.message') {
          // Get event ID
          const id = typeof event.getId === 'function' ? event.getId() :
                    (event.event_id || event.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

          // Get sender
          const sender = typeof event.getSender === 'function' ? event.getSender() :
                       (event.sender || event.user_id || 'Unknown');

          // Get content
          const content = typeof event.getContent === 'function' ? event.getContent() :
                        (event.content || { body: 'Message content unavailable' });

          // Get timestamp
          const timestamp = typeof event.getOriginServerTs === 'function' ? event.getOriginServerTs() :
                          (event.origin_server_ts || event.timestamp || Date.now());

          // Check if message is from current user
          const isFromMe = sender === userId;

          messages.push({
            id,
            roomId,
            sender,
            content,
            timestamp,
            isFromMe
          });
        }
      } catch (eventError) {
        logger.warn(`[SlidingSyncManager] Error processing event:`, eventError);
        // Continue with next event
      }
    }

    // Sort messages by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp);

    logger.info(`[SlidingSyncManager] Processed ${messages.length} messages from ${events.length} events for room ${roomId}`);
    return messages;
  }

  /**
   * Load messages for a room
   * @param {string} roomId - Room ID
   * @param {number} limit - Maximum number of messages to load
   * @returns {Promise<Array>} - Array of messages
   */
  async loadMessages(roomId, limit = DEFAULT_TIMELINE_LIMIT) {
    if (!this.client) {
      logger.error('[SlidingSyncManager] Cannot load messages, no Matrix client');
      return [];
    }

    // If not initialized, try to initialize with the client
    if (!this.initialized) {
      logger.warn('[SlidingSyncManager] Not initialized, attempting to initialize');
      const initialized = this.initialize(this.client);

      // If initialization fails, use fallback method
      if (!initialized) {
        logger.warn('[SlidingSyncManager] Initialization failed, using fallback method');
        return this.loadMessagesWithFallback(roomId, limit);
      }
    }

    // Subscribe to the room if not already subscribed
    if (!this.roomSubscriptions.has(roomId)) {
      await this.subscribeToRoom(roomId, { timelineLimit: limit });
    }

    // Set as active room
    this.activeRoomId = roomId;

    // Perform a sync to get the latest messages
    return this.syncRoom(roomId, { timelineLimit: limit });
  }

  /**
   * Load messages using a fallback method when sliding sync is not supported
   * @param {string} roomId - Room ID
   * @param {number} limit - Maximum number of messages to load
   * @returns {Promise<Array>} - Array of messages
   */
  async loadMessagesWithFallback(roomId, limit = DEFAULT_TIMELINE_LIMIT) {
    logger.info(`[SlidingSyncManager] Using fallback method to load messages for room ${roomId}`);

    if (!this.client) {
      logger.error('[SlidingSyncManager] Cannot load messages with fallback, no Matrix client');
      return [];
    }

    try {
      // Get the room
      const room = this.client.getRoom(roomId);
      if (!room) {
        logger.warn(`[SlidingSyncManager] Room ${roomId} not found`);
        return [];
      }

      // Try to get messages from the timeline
      const timeline = room.getLiveTimeline();
      if (!timeline) {
        logger.warn(`[SlidingSyncManager] No timeline found for room ${roomId}`);
        return [];
      }

      // Get events from the timeline
      let events = timeline.getEvents();
      logger.info(`[SlidingSyncManager] Initial timeline has ${events.length} events`);

      // If we have very few events, try to load more
      if (events.length < limit) {
        try {
          // Try to use pagination to get more events
          if (this.client.paginateEventTimeline) {
            logger.info(`[SlidingSyncManager] Attempting to paginate timeline for room ${roomId}`);
            const paginationResult = await this.client.paginateEventTimeline(timeline, {
              backwards: true,
              limit: limit
            });

            if (paginationResult) {
              events = timeline.getEvents();
              logger.info(`[SlidingSyncManager] After pagination: ${events.length} events for room ${roomId}`);
            }
          }

          // If still not enough, try roomMessages API
          if (events.length < limit && this.client.roomMessages) {
            logger.info(`[SlidingSyncManager] Attempting to fetch messages directly for room ${roomId}`);
            const messageResponse = await this.client.roomMessages(roomId, null, limit, 'b');

            if (messageResponse && messageResponse.chunk && messageResponse.chunk.length > 0) {
              // Process the events to ensure they're in the right format
              const processedEvents = messageResponse.chunk.map(event => {
                // Add isLiveEvent function if it doesn't exist
                if (typeof event.isLiveEvent !== 'function') {
                  event.isLiveEvent = () => false;
                }
                return event;
              });

              // Merge with existing events, avoiding duplicates
              const existingEventIds = new Set(events.map(e => e.getId ? e.getId() : e.event_id));
              const newEvents = processedEvents.filter(e => {
                const eventId = e.getId ? e.getId() : e.event_id;
                return !existingEventIds.has(eventId);
              });

              events = [...events, ...newEvents];
              logger.info(`[SlidingSyncManager] After roomMessages: ${events.length} events for room ${roomId}`);
            }
          }
        } catch (loadError) {
          logger.warn(`[SlidingSyncManager] Error loading more events for room ${roomId}:`, loadError);
        }
      }

      // Process events to extract messages
      const messages = this.processEvents(events, roomId);

      return messages;
    } catch (error) {
      logger.error(`[SlidingSyncManager] Error loading messages with fallback for room ${roomId}:`, error);
      return [];
    }
  }

  /**
   * Send a message to a room
   * @param {string} roomId - Room ID
   * @param {string|Object} content - Message content
   * @returns {Promise<string>} - Event ID of the sent message
   */
  async sendMessage(roomId, content) {
    if (!this.client) {
      logger.error('[SlidingSyncManager] Cannot send message, no Matrix client');
      throw new Error('SlidingSyncManager has no Matrix client');
    }

    // If not initialized, we can still send messages directly
    if (!this.initialized) {
      logger.warn('[SlidingSyncManager] Not initialized, sending message directly');
      return this.sendMessageDirectly(roomId, content);
    }

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
      const eventId = await this.client.sendMessage(roomId, messageContent);

      logger.info(`[SlidingSyncManager] Sent message to room ${roomId}`);
      return eventId;
    } catch (error) {
      logger.error(`[SlidingSyncManager] Error sending message to room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Send a message directly to a room without using sliding sync
   * @param {string} roomId - Room ID
   * @param {string|Object} content - Message content
   * @returns {Promise<string>} - Event ID of the sent message
   */
  async sendMessageDirectly(roomId, content) {
    logger.info(`[SlidingSyncManager] Sending message directly to room ${roomId}`);

    if (!this.client) {
      logger.error('[SlidingSyncManager] Cannot send message directly, no Matrix client');
      throw new Error('SlidingSyncManager has no Matrix client');
    }

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

      // Send the message directly using the Matrix client
      const eventId = await this.client.sendMessage(roomId, messageContent);

      logger.info(`[SlidingSyncManager] Sent message directly to room ${roomId}`);
      return eventId;
    } catch (error) {
      logger.error(`[SlidingSyncManager] Error sending message directly to room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stopSyncLoop();
    this.roomSubscriptions.clear();
    this.activeRoomId = null;
    this.initialized = false;
    this.client = null;
    this.removeAllListeners();
    logger.info('[SlidingSyncManager] Cleaned up resources');
  }
}

// Export singleton instance
const slidingSyncManager = new SlidingSyncManager();
export default slidingSyncManager;
