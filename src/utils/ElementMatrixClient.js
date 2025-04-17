/**
 * ElementMatrixClient
 * 
 * A direct port of Element-web's approach to Matrix client initialization and message syncing
 */
import logger from './logger';

class ElementMatrixClient {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.syncState = null;
    this.syncStateListeners = [];
    this.roomListeners = new Map();
    this.timelineListeners = new Map();
    this.roomStateListeners = new Map();
  }

  /**
   * Initialize the client
   * @param {Object} matrixClient - Matrix client instance
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize(matrixClient) {
    if (!matrixClient) {
      logger.error('[ElementMatrixClient] Cannot initialize: no client provided');
      return false;
    }

    try {
      this.client = matrixClient;
      
      // Set up sync state listener
      this.client.on('sync', this._handleSyncStateChange.bind(this));
      
      // Start the client if it's not already started
      if (this.client.getSyncState() !== 'PREPARED') {
        // Start the client with a timeout
        const startPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            logger.warn('[ElementMatrixClient] Client start timed out, continuing anyway');
            resolve(false);
          }, 30000); // 30 second timeout
          
          this.client.once('sync', (state) => {
            clearTimeout(timeout);
            if (state === 'PREPARED' || state === 'SYNCING') {
              resolve(true);
            } else {
              logger.warn(`[ElementMatrixClient] Client sync reached state ${state}, continuing anyway`);
              resolve(false);
            }
          });
          
          this.client.startClient().catch(reject);
        });
        
        await startPromise;
      }
      
      this.initialized = true;
      logger.info('[ElementMatrixClient] Initialized');
      return true;
    } catch (error) {
      logger.error('[ElementMatrixClient] Error initializing:', error);
      return false;
    }
  }
  
  /**
   * Handle sync state changes
   * @param {string} state - New sync state
   * @param {string} prevState - Previous sync state
   * @private
   */
  _handleSyncStateChange(state, prevState) {
    this.syncState = state;
    logger.info(`[ElementMatrixClient] Sync state changed: ${prevState} -> ${state}`);
    
    // Notify listeners
    this.syncStateListeners.forEach(listener => {
      try {
        listener(state, prevState);
      } catch (error) {
        logger.error('[ElementMatrixClient] Error in sync state listener:', error);
      }
    });
  }
  
  /**
   * Add a sync state listener
   * @param {Function} listener - Listener function
   */
  addSyncStateListener(listener) {
    if (typeof listener === 'function') {
      this.syncStateListeners.push(listener);
    }
  }
  
  /**
   * Remove a sync state listener
   * @param {Function} listener - Listener function
   */
  removeSyncStateListener(listener) {
    const index = this.syncStateListeners.indexOf(listener);
    if (index !== -1) {
      this.syncStateListeners.splice(index, 1);
    }
  }
  
  /**
   * Get all rooms
   * @returns {Array} - Array of rooms
   */
  getRooms() {
    if (!this.initialized || !this.client) {
      logger.error('[ElementMatrixClient] Cannot get rooms: not initialized');
      return [];
    }
    
    return this.client.getRooms() || [];
  }
  
  /**
   * Get a room by ID
   * @param {string} roomId - Room ID
   * @returns {Object} - Room object
   */
  getRoom(roomId) {
    if (!this.initialized || !this.client) {
      logger.error('[ElementMatrixClient] Cannot get room: not initialized');
      return null;
    }
    
    return this.client.getRoom(roomId);
  }
  
  /**
   * Load timeline for a room
   * @param {string} roomId - Room ID
   * @param {Object} options - Options
   * @returns {Promise<Array>} - Array of timeline events
   */
  async loadRoomTimeline(roomId, options = {}) {
    if (!this.initialized || !this.client) {
      logger.error('[ElementMatrixClient] Cannot load timeline: not initialized');
      return [];
    }
    
    const {
      limit = 50,
      initialEventId = null
    } = options;
    
    try {
      const room = this.client.getRoom(roomId);
      if (!room) {
        logger.error(`[ElementMatrixClient] Room not found: ${roomId}`);
        return [];
      }
      
      // Get the timeline
      let timeline = room.getLiveTimeline();
      
      // If we have an initial event ID, try to find the timeline containing it
      if (initialEventId) {
        const timelineSet = room.getTimelineSets()[0];
        const timelineIndex = timelineSet.getTimelineIndexOfEvent(initialEventId);
        
        if (timelineIndex !== null) {
          timeline = timelineSet.getTimelines()[timelineIndex];
        }
      }
      
      // Get initial events
      let events = timeline.getEvents();
      logger.info(`[ElementMatrixClient] Initial timeline has ${events.length} events`);
      
      // If we don't have enough events, paginate
      if (events.length < limit) {
        // Paginate backwards to get more events
        const paginationCount = Math.ceil((limit - events.length) / 20);
        
        for (let i = 0; i < paginationCount; i++) {
          try {
            // Paginate backwards
            const paginateResult = await this.client.paginateEventTimeline(timeline, {
              backwards: true,
              limit: 20
            });
            
            if (!paginateResult) {
              logger.info(`[ElementMatrixClient] No more events to paginate at attempt ${i+1}`);
              break;
            }
            
            // Get updated events
            events = timeline.getEvents();
            logger.info(`[ElementMatrixClient] After pagination attempt ${i+1}: ${events.length} events`);
            
            // If we have enough events, stop paginating
            if (events.length >= limit) {
              break;
            }
          } catch (paginationError) {
            logger.warn(`[ElementMatrixClient] Error during pagination attempt ${i+1}:`, paginationError);
            // Continue to next attempt
          }
        }
      }
      
      // Process events
      const timelineEvents = events.map(event => this._processEvent(event, room));
      
      // Sort by timestamp
      timelineEvents.sort((a, b) => a.timestamp - b.timestamp);
      
      logger.info(`[ElementMatrixClient] Loaded ${timelineEvents.length} timeline events for room ${roomId}`);
      return timelineEvents;
    } catch (error) {
      logger.error('[ElementMatrixClient] Error loading timeline:', error);
      return [];
    }
  }
  
  /**
   * Process an event into a standardized format
   * @param {Object} event - Matrix event
   * @param {Object} room - Matrix room
   * @returns {Object} - Processed event
   * @private
   */
  _processEvent(event, room) {
    try {
      // Get event ID
      const id = typeof event.getId === 'function' ? event.getId() : 
                event.event_id || event.id;
      
      // Get event type
      const type = typeof event.getType === 'function' ? event.getType() : 
                  event.type || (event.event && event.event.type);
      
      // Get sender
      const senderId = typeof event.getSender === 'function' ? event.getSender() : 
                      event.sender || event.user_id || (event.event && event.event.sender);
      
      // Get sender display name
      let senderName = senderId;
      if (room) {
        const member = room.getMember(senderId);
        if (member && member.name) {
          senderName = member.name;
        }
      }
      
      // Get content
      const content = typeof event.getContent === 'function' ? event.getContent() : 
                     event.content || (event.event && event.event.content) || {};
      
      // Get timestamp
      const timestamp = typeof event.getOriginServerTs === 'function' ? event.getOriginServerTs() : 
                       event.origin_server_ts || event.timestamp || 
                       (event.event && event.event.origin_server_ts) || Date.now();
      
      // Check if the event is redacted
      const isRedacted = typeof event.isRedacted === 'function' ? event.isRedacted() : 
                        event.unsigned && event.unsigned.redacted_because;
      
      // Check if the event is from the current user
      const isFromMe = this.client && senderId === this.client.getUserId();
      
      // Get the event state key (for state events)
      const stateKey = typeof event.getStateKey === 'function' ? event.getStateKey() : 
                      event.state_key;
      
      // Process content based on event type
      let processedContent = { ...content };
      let body = '';
      
      if (type === 'm.room.message') {
        body = content.body || '';
        
        // Handle message types
        if (content.msgtype === 'm.image') {
          processedContent.thumbnail = this._getThumbnailUrl(content);
        } else if (content.msgtype === 'm.file') {
          processedContent.filename = content.body || 'File';
          processedContent.fileUrl = this._getFileUrl(content);
        } else if (content.msgtype === 'm.video') {
          processedContent.thumbnail = this._getThumbnailUrl(content);
          processedContent.videoUrl = this._getFileUrl(content);
        } else if (content.msgtype === 'm.audio') {
          processedContent.audioUrl = this._getFileUrl(content);
        }
      } else if (type === 'm.room.member') {
        const membership = content.membership;
        const prevContent = typeof event.getPrevContent === 'function' ? event.getPrevContent() : 
                           event.prev_content || {};
        
        if (membership === 'join') {
          body = `${senderName} joined the room`;
        } else if (membership === 'leave') {
          body = `${senderName} left the room`;
        } else if (membership === 'invite') {
          body = `${senderName} invited ${stateKey} to the room`;
        } else if (membership === 'ban') {
          body = `${senderName} banned ${stateKey} from the room`;
        } else if (membership === 'knock') {
          body = `${senderName} requested to join the room`;
        }
        
        // Handle profile changes
        if (membership === 'join' && prevContent.membership === 'join') {
          if (content.displayname !== prevContent.displayname) {
            body = `${prevContent.displayname || senderId} changed their display name to ${content.displayname || senderId}`;
          } else if (content.avatar_url !== prevContent.avatar_url) {
            body = `${senderName} changed their avatar`;
          }
        }
      } else if (type === 'm.room.name') {
        body = `Room name changed to: ${content.name || 'Unnamed'}`;
      } else if (type === 'm.room.topic') {
        body = `Room topic changed to: ${content.topic || 'No topic'}`;
      } else if (type === 'm.room.avatar') {
        body = `Room avatar changed`;
      } else if (type === 'm.room.encrypted') {
        body = `Encrypted message`;
      } else if (type === 'm.sticker') {
        body = `Sticker`;
        processedContent.thumbnail = this._getThumbnailUrl(content);
      } else if (type === 'm.reaction') {
        const relatesTo = content['m.relates_to'] || {};
        body = `Reacted with ${relatesTo.key || '👍'}`;
      } else {
        body = `${type} event`;
      }
      
      return {
        id,
        type,
        senderId,
        senderName,
        content: processedContent,
        body,
        timestamp,
        isRedacted,
        isFromMe,
        stateKey,
        rawEvent: event
      };
    } catch (error) {
      logger.warn('[ElementMatrixClient] Error processing event:', error);
      
      return {
        id: event.getId ? event.getId() : `unknown_${Date.now()}`,
        type: 'unknown',
        senderId: 'unknown',
        senderName: 'Unknown',
        content: {},
        body: 'Error processing event',
        timestamp: Date.now(),
        isRedacted: false,
        isFromMe: false,
        stateKey: null,
        rawEvent: event
      };
    }
  }
  
  /**
   * Get thumbnail URL from content
   * @param {Object} content - Event content
   * @returns {string} - Thumbnail URL
   * @private
   */
  _getThumbnailUrl(content) {
    if (content.info && content.info.thumbnail_url) {
      return this.client.mxcUrlToHttp(content.info.thumbnail_url);
    } else if (content.url) {
      return this.client.mxcUrlToHttp(content.url);
    }
    return '';
  }
  
  /**
   * Get file URL from content
   * @param {Object} content - Event content
   * @returns {string} - File URL
   * @private
   */
  _getFileUrl(content) {
    if (content.url) {
      return this.client.mxcUrlToHttp(content.url);
    }
    return '';
  }
  
  /**
   * Add a room timeline listener
   * @param {string} roomId - Room ID
   * @param {Function} callback - Callback function
   * @returns {boolean} - Whether the listener was added
   */
  addRoomTimelineListener(roomId, callback) {
    if (!this.initialized || !this.client) {
      logger.error('[ElementMatrixClient] Cannot add timeline listener: not initialized');
      return false;
    }
    
    if (!roomId || typeof callback !== 'function') {
      logger.error('[ElementMatrixClient] Cannot add timeline listener: invalid parameters');
      return false;
    }
    
    // Remove existing listener
    this.removeRoomTimelineListener(roomId);
    
    // Create a new listener
    const listener = (event, room) => {
      // Only process events for the specified room
      if (!room || room.roomId !== roomId) return;
      
      // Process the event
      const processedEvent = this._processEvent(event, room);
      
      // Call the callback
      callback(processedEvent);
    };
    
    // Add the listener
    this.client.on('Room.timeline', listener);
    
    // Store the listener
    this.timelineListeners.set(roomId, listener);
    
    logger.info(`[ElementMatrixClient] Added timeline listener for room ${roomId}`);
    return true;
  }
  
  /**
   * Remove a room timeline listener
   * @param {string} roomId - Room ID
   * @returns {boolean} - Whether the listener was removed
   */
  removeRoomTimelineListener(roomId) {
    if (!this.initialized || !this.client) {
      logger.error('[ElementMatrixClient] Cannot remove timeline listener: not initialized');
      return false;
    }
    
    if (!roomId) {
      logger.error('[ElementMatrixClient] Cannot remove timeline listener: no roomId provided');
      return false;
    }
    
    // Get the listener
    const listener = this.timelineListeners.get(roomId);
    if (!listener) {
      return false;
    }
    
    // Remove the listener
    this.client.removeListener('Room.timeline', listener);
    
    // Remove from the map
    this.timelineListeners.delete(roomId);
    
    logger.info(`[ElementMatrixClient] Removed timeline listener for room ${roomId}`);
    return true;
  }
  
  /**
   * Send a message to a room
   * @param {string} roomId - Room ID
   * @param {string|Object} content - Message content
   * @returns {Promise<Object>} - Sent event
   */
  async sendMessage(roomId, content) {
    if (!this.initialized || !this.client) {
      throw new Error('Cannot send message: not initialized');
    }
    
    if (!roomId) {
      throw new Error('Cannot send message: no roomId provided');
    }
    
    if (!content) {
      throw new Error('Cannot send message: no content provided');
    }
    
    try {
      // If content is a string, convert it to a content object
      const messageContent = typeof content === 'string' ? {
        msgtype: 'm.text',
        body: content
      } : content;
      
      // Send the message
      const result = await this.client.sendEvent(roomId, 'm.room.message', messageContent);
      
      logger.info(`[ElementMatrixClient] Sent message to room ${roomId}`);
      return result;
    } catch (error) {
      logger.error('[ElementMatrixClient] Error sending message:', error);
      throw error;
    }
  }
  
  /**
   * Join a room
   * @param {string} roomId - Room ID
   * @returns {Promise<Object>} - Room object
   */
  async joinRoom(roomId) {
    if (!this.initialized || !this.client) {
      throw new Error('Cannot join room: not initialized');
    }
    
    if (!roomId) {
      throw new Error('Cannot join room: no roomId provided');
    }
    
    try {
      await this.client.joinRoom(roomId);
      
      // Wait for the room to be available
      const room = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          logger.warn(`[ElementMatrixClient] Timeout waiting for room ${roomId} to be available`);
          resolve(this.client.getRoom(roomId));
        }, 5000);
        
        const checkRoom = () => {
          const room = this.client.getRoom(roomId);
          if (room) {
            clearTimeout(timeout);
            resolve(room);
          } else {
            setTimeout(checkRoom, 500);
          }
        };
        
        checkRoom();
      });
      
      logger.info(`[ElementMatrixClient] Joined room ${roomId}`);
      return room;
    } catch (error) {
      logger.error('[ElementMatrixClient] Error joining room:', error);
      throw error;
    }
  }
  
  /**
   * Get a parent event for a reply
   * @param {string} roomId - Room ID
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} - Parent event
   */
  async getParentEvent(roomId, eventId) {
    if (!this.initialized || !this.client) {
      logger.error('[ElementMatrixClient] Cannot get parent event: not initialized');
      return null;
    }
    
    if (!roomId || !eventId) {
      logger.error('[ElementMatrixClient] Cannot get parent event: missing roomId or eventId');
      return null;
    }
    
    try {
      // Get the room
      const room = this.client.getRoom(roomId);
      if (!room) {
        logger.error(`[ElementMatrixClient] Room not found: ${roomId}`);
        return null;
      }
      
      // Try to find the event in the timeline
      const timelineSet = room.getTimelineSets()[0];
      if (!timelineSet) {
        logger.error(`[ElementMatrixClient] Timeline set not found for room ${roomId}`);
        return null;
      }
      
      // Try to get the event from the timeline set
      const event = timelineSet.findEventById(eventId);
      if (event) {
        return this._processEvent(event, room);
      }
      
      // If we couldn't find the event, try to paginate to get more events
      const timeline = room.getLiveTimeline();
      
      // Paginate backwards to get more events
      for (let i = 0; i < 3; i++) {
        try {
          const paginateResult = await this.client.paginateEventTimeline(timeline, {
            backwards: true,
            limit: 50
          });
          
          if (!paginateResult) {
            logger.info(`[ElementMatrixClient] No more events to paginate at attempt ${i+1}`);
            break;
          }
          
          // Try to find the event again
          const event = timelineSet.findEventById(eventId);
          if (event) {
            return this._processEvent(event, room);
          }
        } catch (paginationError) {
          logger.warn(`[ElementMatrixClient] Error paginating timeline for parent event:`, paginationError);
        }
      }
      
      logger.warn(`[ElementMatrixClient] Could not find parent event: ${eventId}`);
      return null;
    } catch (error) {
      logger.error('[ElementMatrixClient] Error getting parent event:', error);
      return null;
    }
  }
}

// Create a singleton instance
const elementMatrixClient = new ElementMatrixClient();

export default elementMatrixClient;
