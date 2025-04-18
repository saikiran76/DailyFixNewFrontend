import logger from './logger';
import { saveToIndexedDB, getFromIndexedDB } from './indexedDBHelper';

/**
 * Manages room lists and syncing for Matrix clients
 */
class RoomListManager {
  constructor() {
    this.roomLists = new Map(); // userId -> { rooms, lastSync, filters }
    this.syncInProgress = new Map(); // userId -> boolean
    this.roomCache = new Map(); // roomId -> { data, lastUpdated }
    this.messageCache = new Map(); // roomId -> { messages, lastUpdated }
    this.eventHandlers = new Map(); // userId -> { onRoomsUpdated, onMessagesUpdated }
  }

  /**
   * Check if room list is initialized for a user
   * @param {string} userId - User ID
   * @returns {boolean} - Whether room list is initialized
   */
  isInitialized(userId) {
    return this.roomLists.has(userId) && this.roomLists.get(userId).client;
  }

  /**
   * Initialize room list for a user
   * @param {string} userId - User ID
   * @param {Object} matrixClient - Matrix client instance
   * @param {Object} options - Options for room list
   * @param {Function} onRoomsUpdated - Callback for room updates
   */
  initRoomList(userId, matrixClient, options = {}, onRoomsUpdated = null) {
    if (!userId || !matrixClient) {
      logger.error('[RoomListManager] Cannot initialize room list without userId or matrixClient');
      return;
    }

    // Store event handlers
    if (onRoomsUpdated) {
      this.eventHandlers.set(userId, {
        onRoomsUpdated,
        onMessagesUpdated: options.onMessagesUpdated || null
      });
    }

    // Initialize room list
    this.roomLists.set(userId, {
      rooms: [],
      lastSync: null,
      filters: options.filters || {},
      sortBy: options.sortBy || 'lastMessage',
      client: matrixClient
    });

    // Set up event listeners
    this.setupEventListeners(userId, matrixClient);

    // Start initial sync
    this.syncRooms(userId);

    logger.info('[RoomListManager] Room list initialized for user:', userId);
  }

  /**
   * Set up event listeners for a Matrix client
   * @param {string} userId - User ID
   * @param {Object} matrixClient - Matrix client instance
   */
  setupEventListeners(userId, matrixClient) {
    // Room timeline events (new messages)
    const handleRoomTimeline = (event, room) => {
      // Add isLiveEvent function if it doesn't exist
      if (typeof event.isLiveEvent !== 'function') {
        event.isLiveEvent = () => true; // Assume all events are live events
      }

      // Skip non-live events
      if (!event.isLiveEvent()) return;

      // Update room in list
      this.updateRoomInList(userId, room);

      // Update message cache
      this.updateMessageCache(userId, room, event);

      // Notify event handlers
      this.notifyRoomsUpdated(userId);
    };

    // Room state changes
    const handleRoomState = (_event, state) => {
      const room = state.room;
      if (room) {
        this.updateRoomInList(userId, room);
        this.notifyRoomsUpdated(userId);
      }
    };

    // Sync state changes
    const handleSyncState = (state, prevState) => {
      if (state === 'PREPARED' && prevState !== 'PREPARED') {
        // Initial sync completed
        this.syncRooms(userId, true);
      }
    };

    // Add listeners
    matrixClient.on('Room.timeline', handleRoomTimeline);
    matrixClient.on('RoomState.events', handleRoomState);
    matrixClient.on('sync', handleSyncState);

    // Store listeners for cleanup
    this.roomLists.get(userId).listeners = {
      handleRoomTimeline,
      handleRoomState,
      handleSyncState
    };
  }

  /**
   * Clean up event listeners for a user
   * @param {string} userId - User ID
   */
  cleanupEventListeners(userId) {
    const roomList = this.roomLists.get(userId);
    if (!roomList || !roomList.client || !roomList.listeners) return;

    const { client, listeners } = roomList;

    // Remove listeners
    client.removeListener('Room.timeline', listeners.handleRoomTimeline);
    client.removeListener('RoomState.events', listeners.handleRoomState);
    client.removeListener('sync', listeners.handleSyncState);

    logger.info('[RoomListManager] Event listeners cleaned up for user:', userId);
  }

  /**
   * Sync rooms for a user
   * @param {string} userId - User ID
   * @param {boolean} force - Force sync even if already in progress
   * @returns {Promise<Array>} - The synced rooms
   */
  async syncRooms(userId, force = false) {
    // Check if sync is already in progress
    if (this.syncInProgress.get(userId) && !force) {
      logger.info('[RoomListManager] Sync already in progress for user:', userId);
      return this.roomLists.get(userId)?.rooms || [];
    }

    const roomList = this.roomLists.get(userId);
    if (!roomList || !roomList.client) {
      logger.error('[RoomListManager] Cannot sync rooms, room list not initialized for user:', userId);
      return [];
    }

    this.syncInProgress.set(userId, true);

    try {
      const { client, filters } = roomList;

      // Check if client is ready
      let syncState;
      try {
        syncState = client.getSyncState();
        logger.info(`[RoomListManager] Matrix client sync state: ${syncState}`);
      } catch (syncStateError) {
        logger.warn('[RoomListManager] Error getting sync state:', syncStateError);
        syncState = 'UNKNOWN';
      }

      if (syncState !== 'PREPARED' && syncState !== 'SYNCING') {
        logger.warn(`[RoomListManager] Matrix client sync state is ${syncState}, waiting for sync...`);

        // Try to force a sync
        try {
          if (client.syncLeftRooms) {
            await client.syncLeftRooms();
            // Wait a moment for sync to process
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.warn('[RoomListManager] syncLeftRooms method not available on client');
          }
        } catch (syncError) {
          logger.warn('[RoomListManager] Error forcing sync:', syncError);
          // Continue anyway
        }
      }

      // Get all rooms
      let allRooms = [];
      try {
        allRooms = client.getRooms() || [];
        logger.info(`[RoomListManager] Found ${allRooms.length} total rooms for user: ${userId}`);
      } catch (getRoomsError) {
        logger.error('[RoomListManager] Error getting rooms:', getRoomsError);
        // Continue with empty rooms array
      }

      // Log all rooms for debugging if force sync is requested
      if (force) {
        allRooms.forEach((room, index) => {
          try {
            const members = room.getJoinedMembers() || [];
            const memberIds = members.map(m => m.userId).join(', ');
            logger.info(`[RoomListManager] Room ${index}: ${room.roomId} - ${room.name} - Members: ${memberIds}`);

            // Check for Telegram senders in the room's timeline
            try {
              const timeline = room.getLiveTimeline && room.getLiveTimeline();
              if (timeline) {
                const events = timeline.getEvents && timeline.getEvents();
                if (events && events.length > 0) {
                  // Find events from Telegram senders
                  const telegramEvents = events.filter(event => {
                    const sender = event.getSender && event.getSender();
                    return sender && (
                      sender.includes('@telegram_') ||
                      sender.includes(':telegram') ||
                      sender.includes('telegram')
                    );
                  });

                  if (telegramEvents.length > 0) {
                    logger.info(`[RoomListManager] Found ${telegramEvents.length} Telegram events in room ${room.roomId}`);
                    telegramEvents.forEach((event, eventIndex) => {
                      logger.info(`[RoomListManager] Telegram event ${eventIndex} in room ${room.roomId}: sender=${event.getSender()}, type=${event.getType()}`);
                    });
                  }
                }
              }
            } catch (timelineError) {
              // Timeline might not be accessible
            }
          } catch (roomError) {
            logger.error(`[RoomListManager] Error getting room details for room ${index}:`, roomError);
          }
        });
      }

      // Apply filters
      let filteredRooms = allRooms;

      // Filter out login rooms
      filteredRooms = filteredRooms.filter(room => {
        const roomName = room.name || '';
        return !roomName.toLowerCase().includes('login');
      });

      logger.info(`[RoomListManager] Filtered out login rooms, ${filteredRooms.length} rooms remaining`);

      // Filter by platform (e.g., 'telegram', 'whatsapp')
      if (filters && filters.platform) {
        try {
          filteredRooms = this.filterRoomsByPlatform(filteredRooms, filters.platform);
          logger.info(`[RoomListManager] Filtered to ${filteredRooms.length} ${filters.platform} rooms`);
        } catch (filterError) {
          logger.error('[RoomListManager] Error filtering rooms by platform:', filterError);
          // Continue with unfiltered rooms
        }
      }

      // If no rooms found but we're looking for Telegram rooms, check for the special Telegram room
      if (filteredRooms.length === 0 && filters.platform === 'telegram') {
        logger.info('[RoomListManager] No Telegram rooms found, checking for special Telegram room');

        // Check localStorage for Telegram room ID
        try {
          const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
          const telegramRoomId = connectionStatus.telegramRoomId;

          if (telegramRoomId) {
            logger.info('[RoomListManager] Found Telegram room ID in localStorage:', telegramRoomId);

            // Try to get the room directly
            const telegramRoom = client.getRoom(telegramRoomId);
            if (telegramRoom) {
              logger.info('[RoomListManager] Found Telegram room:', telegramRoom.name);
              filteredRooms = [telegramRoom];
            } else {
              // Try to join the room
              try {
                logger.info('[RoomListManager] Trying to join Telegram room:', telegramRoomId);
                await client.joinRoom(telegramRoomId);
                const joinedRoom = client.getRoom(telegramRoomId);
                if (joinedRoom) {
                  filteredRooms = [joinedRoom];
                }
              } catch (joinError) {
                logger.warn('[RoomListManager] Error joining Telegram room:', joinError);

                // If we can't join the room, create a placeholder room
                logger.info('[RoomListManager] Creating placeholder Telegram room');
                filteredRooms = [{
                  id: telegramRoomId,
                  name: 'Telegram',
                  avatar: null,
                  lastMessage: 'Connected to Telegram',
                  timestamp: Date.now(),
                  unreadCount: 0,
                  isGroup: false,
                  isTelegram: true,
                  members: 1,
                  isPlaceholder: true,
                  telegramContact: {
                    id: 'telegram_user',
                    username: 'telegram_user',
                    firstName: 'Telegram',
                    lastName: '',
                    avatar: null
                  }
                }];
              }
            }
          } else {
            // If we don't have a Telegram room ID, create a placeholder room
            logger.info('[RoomListManager] No Telegram room ID found, creating placeholder');
            filteredRooms = [{
              id: 'telegram_placeholder',
              name: 'Telegram',
              avatar: null,
              lastMessage: 'Connected to Telegram',
              timestamp: Date.now(),
              unreadCount: 0,
              isGroup: false,
              isTelegram: true,
              members: 1,
              isPlaceholder: true,
              telegramContact: {
                id: 'telegram_user',
                username: 'telegram_user',
                firstName: 'Telegram',
                lastName: '',
                avatar: null
              }
            }];
          }
        } catch (storageError) {
          logger.warn('[RoomListManager] Error checking localStorage for Telegram room:', storageError);

          // If we can't check localStorage, create a placeholder room
          logger.info('[RoomListManager] Creating placeholder Telegram room due to storage error');
          filteredRooms = [{
            id: 'telegram_placeholder',
            name: 'Telegram',
            avatar: null,
            lastMessage: 'Connected to Telegram',
            timestamp: Date.now(),
            unreadCount: 0,
            isGroup: false,
            isTelegram: true,
            members: 1,
            isPlaceholder: true,
            telegramContact: {
              id: 'telegram_user',
              username: 'telegram_user',
              firstName: 'Telegram',
              lastName: '',
              avatar: null
            }
          }];
        }
      }

      // Transform rooms to our format
      const transformedRooms = this.transformRooms(userId, filteredRooms);

      // Sort rooms
      const sortedRooms = this.sortRooms(transformedRooms, roomList.sortBy);

      // Update room list
      roomList.rooms = sortedRooms;
      roomList.lastSync = new Date();

      // Cache rooms
      this.cacheRooms(userId, sortedRooms);

      // Notify event handlers
      this.notifyRoomsUpdated(userId);

      logger.info('[RoomListManager] Rooms synced for user:', userId, 'count:', sortedRooms.length);
      return sortedRooms;
    } catch (error) {
      logger.error('[RoomListManager] Error syncing rooms:', error);
      return roomList?.rooms || [];
    } finally {
      this.syncInProgress.set(userId, false);
    }
  }

  /**
   * Filter rooms by platform
   * @param {Array} rooms - List of rooms
   * @param {string} platform - Platform to filter by (e.g., 'telegram', 'whatsapp')
   * @returns {Array} Filtered rooms
   */
  filterRoomsByPlatform(rooms, platform) {
    if (platform === 'telegram') {
      // First check if we have a Telegram room ID in localStorage
      let telegramRoomId = null;
      try {
        const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
        telegramRoomId = connectionStatus.telegramRoomId;
      } catch (error) {
        // Ignore localStorage errors
      }

      // Log all rooms for debugging
      logger.info(`[RoomListManager] Filtering ${rooms.length} rooms for Telegram`);

      // If we have a specific Telegram room ID, check if it exists in the rooms
      // but don't return only that room - we want ALL Telegram rooms
      if (telegramRoomId) {
        const telegramRoom = rooms.find(room => room.roomId === telegramRoomId);
        if (telegramRoom) {
          logger.info(`[RoomListManager] Found exact Telegram room match: ${telegramRoom.roomId}`);
          // CRITICAL FIX: Don't return only this room - continue processing to find all Telegram rooms
        } else {
          logger.warn(`[RoomListManager] Telegram room ID ${telegramRoomId} not found in rooms list`);
        }
      }

      // Log all rooms for debugging
      rooms.forEach((room, index) => {
        try {
          // Get both joined and invited members
          const joinedMembers = room.getJoinedMembers() || [];
          const joinedMemberIds = joinedMembers.map(m => m.userId).join(', ');

          // Get invited members (Element checks these too)
          let invitedMembers = [];
          try {
            // Try to get invited members from room state
            const memberEvents = room.currentState.getStateEvents('m.room.member');
            invitedMembers = memberEvents
              .filter(event => event.getContent().membership === 'invite')
              .map(event => ({ userId: event.getStateKey() }));
          } catch (memberError) {
            // Ignore errors getting invited members
          }

          const invitedMemberIds = invitedMembers.map(m => m.userId).join(', ');

          // Check room state
          let roomState = 'unknown';
          try {
            if (room.getMyMembership) {
              roomState = room.getMyMembership();
            }
          } catch (stateError) {
            // Ignore errors getting room state
          }

          logger.info(`[RoomListManager] Room ${index}: ${room.roomId} - ${room.name} - State: ${roomState} - Joined: ${joinedMemberIds} - Invited: ${invitedMemberIds}`);
        } catch (error) {
          logger.error(`[RoomListManager] Error getting room details for room ${index}:`, error);
        }
      });

      // Filter rooms for Telegram
      const telegramRooms = rooms.filter(room => {
        try {
          // CRITICAL: Check room membership state first
          let roomState = 'unknown';
          try {
            if (room.getMyMembership) {
              roomState = room.getMyMembership();
            }
          } catch (stateError) {
            // Ignore errors getting room state
          }

          // Include rooms in 'invite' state (Element does this)
          const isInvitedRoom = roomState === 'invite';

          // Get joined members
          const joinedMembers = room.getJoinedMembers() || [];

          // Get invited members (Element checks these too)
          let invitedMembers = [];
          try {
            // Try to get invited members from room state
            const memberEvents = room.currentState.getStateEvents('m.room.member');
            invitedMembers = memberEvents
              .filter(event => event.getContent().membership === 'invite')
              .map(event => ({ userId: event.getStateKey() }));
          } catch (memberError) {
            // Ignore errors getting invited members
          }

          // Combine joined and invited members for checking
          const allMembers = [...joinedMembers, ...invitedMembers];

          // Check if room has Telegram bot as a member (joined or invited)
          const hasTelegramBot = allMembers.some(member =>
            member.userId === '@telegrambot:dfix-hsbridge.duckdns.org' ||
            member.userId.includes('telegram') ||
            (member.name && member.name.includes('Telegram'))
          );

          // Get room name
          let roomName = room.name || '';

          // Check if any messages in the room are from Telegram users
          let hasTelegramSenders = false;
          try {
            const timeline = room.getLiveTimeline && room.getLiveTimeline();
            if (timeline) {
              const events = timeline.getEvents && timeline.getEvents();
              if (events && events.length > 0) {
                hasTelegramSenders = events.some(event => {
                  const sender = event.getSender && event.getSender();
                  return sender && (
                    sender.includes('@telegram_') ||
                    sender.includes(':telegram') ||
                    sender.includes('telegram')
                  );
                });

                if (hasTelegramSenders) {
                  logger.info(`[RoomListManager] Found Telegram sender in room: ${room.roomId}`);
                }
              }
            }
          } catch (timelineError) {
            // Timeline might not be accessible
            logger.warn(`[RoomListManager] Error checking timeline for Telegram senders in room ${room.roomId}:`, timelineError);
          }

          // Check for Telegram-specific invite events
          let hasTelegramInvite = false;
          if (isInvitedRoom) {
            try {
              // Check if the inviter is a Telegram-related user
              const memberEvents = room.currentState.getStateEvents('m.room.member');
              // Get the current user ID from the userConfig
              const currentUserId = userId;

              const myMemberEvent = memberEvents.find(event =>
                event.getStateKey() === currentUserId &&
                event.getContent().membership === 'invite'
              );

              if (myMemberEvent) {
                const inviter = myMemberEvent.getSender();
                hasTelegramInvite = inviter && (
                  inviter.includes('@telegram_') ||
                  inviter.includes(':telegram') ||
                  inviter.includes('telegram') ||
                  inviter === '@telegrambot:dfix-hsbridge.duckdns.org'
                );

                if (hasTelegramInvite) {
                  logger.info(`[RoomListManager] Found Telegram invite in room: ${room.roomId} from ${inviter}`);
                }
              }
            } catch (inviteError) {
              // Ignore errors checking invite events
            }
          }

          // Check room name for Telegram indicators
          // We already have roomName from above
          const isTelegramRoom = roomName.includes('Telegram') ||
                                roomName.includes('tg_') ||
                                (room.getCanonicalAlias && room.getCanonicalAlias()?.includes('telegram'));

          // Check for Telegram-specific state events
          let hasTelegramState = false;
          try {
            const stateEvents = room.currentState.getStateEvents('io.dailyfix.telegram');
            hasTelegramState = stateEvents && stateEvents.length > 0;
          } catch (stateError) {
            // State event might not exist
          }

          // Check room creation events for Telegram indicators
          let isTelegramCreation = false;
          try {
            const createEvent = room.currentState.getStateEvents('m.room.create')[0];
            if (createEvent) {
              const content = createEvent.getContent();
              isTelegramCreation = content.telegram === true ||
                                 content.platform === 'telegram' ||
                                 (content.topic && content.topic.includes('Telegram'));
            }
          } catch (createError) {
            // Create event might not exist or be accessible
          }

          // Check if this room was created specifically for Telegram
          const isTelegramPurpose = room.getJoinRule && room.getJoinRule() === 'invite' && allMembers.length <= 2;

          // Check if room ID matches the one in localStorage
          const isStoredRoom = telegramRoomId && room.roomId === telegramRoomId;

          // Check if this is a service room that should be excluded
          const isServiceRoom =
            roomName.includes('Telegram Login') ||
            roomName.includes('WhatsApp bridge bot') ||
            roomName.includes('WhatsApp Bridge') ||
            roomName.includes('Telegram Bridge') ||
            roomName.includes('Bridge Status') ||
            roomName.includes('WhatsApp Web') ||
            roomName === 'Telegram' ||
            roomName === 'WhatsApp';

          // Also check if any member is a WhatsApp bot
          const hasWhatsAppBot = allMembers.some(member =>
            member.userId === '@whatsappbot:dfix-hsbridge.duckdns.org' ||
            member.userId.includes('whatsapp') ||
            (member.name && member.name.includes('WhatsApp'))
          );

          // CRITICAL: Include invited rooms from Telegram users, but exclude service rooms and WhatsApp rooms
          const result = !isServiceRoom && !hasWhatsAppBot &&
            (isStoredRoom || hasTelegramBot || hasTelegramSenders || isTelegramRoom ||
             hasTelegramState || isTelegramCreation || isTelegramPurpose || hasTelegramInvite ||
             (isInvitedRoom && (roomName.includes('Telegram') || roomName.includes('tg_'))));
          if (result) {
            logger.info(`[RoomListManager] Identified Telegram room: ${room.roomId} - ${room.name}`);
          }
          return result;
        } catch (error) {
          logger.error(`[RoomListManager] Error filtering room ${room.roomId}:`, error);
          return false;
        }
      });

      // If we found Telegram rooms, return them
      if (telegramRooms.length > 0) {
        logger.info(`[RoomListManager] Found ${telegramRooms.length} Telegram rooms`);
        return telegramRooms;
      }

      // If we have a telegramRoomId but didn't find it in the rooms list, try to get it directly
      if (telegramRoomId) {
        try {
          const client = rooms[0]?.client || this.roomLists.get(Object.keys(this.roomLists)[0])?.client;
          if (client) {
            const telegramRoom = client.getRoom(telegramRoomId);
            if (telegramRoom) {
              logger.info(`[RoomListManager] Found Telegram room directly: ${telegramRoom.roomId}`);
              return [telegramRoom];
            }
          }
        } catch (error) {
          logger.error('[RoomListManager] Error getting Telegram room directly:', error);
        }
      }

      // If we still haven't found any Telegram rooms, return an empty array
      logger.warn('[RoomListManager] No Telegram rooms found after filtering');
      return [];
    }

    // Add more platform filters as needed

    return rooms;
  }

  /**
   * Transform Matrix rooms to our format
   * @param {string} userId - User ID
   * @param {Array} rooms - List of Matrix rooms
   * @returns {Array} Transformed rooms
   */
  transformRooms(userId, rooms) {
    return rooms.map(room => {
      // Get room membership state
      let roomState = 'unknown';
      try {
        if (room.getMyMembership) {
          roomState = room.getMyMembership();
        }
      } catch (stateError) {
        // Ignore errors getting room state
      }

      // Log room state for debugging
      logger.info(`[RoomListManager] Room ${room.roomId} state: ${roomState}`);

      // Get all joined members
      const joinedMembers = room.getJoinedMembers() || [];

      // Get invited members (Element checks these too)
      let invitedMembers = [];
      try {
        // Try to get invited members from room state
        const memberEvents = room.currentState.getStateEvents('m.room.member');
        invitedMembers = memberEvents
          .filter(event => event.getContent().membership === 'invite')
          .map(event => ({ userId: event.getStateKey() }));
      } catch (memberError) {
        // Ignore errors getting invited members
      }

      // Combine joined and invited members for checking
      const allMembers = [...joinedMembers, ...invitedMembers];

      // Find the Telegram bot or Telegram users
      const telegramBot = allMembers.find(member =>
        member.userId === '@telegrambot:dfix-hsbridge.duckdns.org' ||
        member.userId.includes('telegram') ||
        member.name?.includes('Telegram')
      );

      // Check if any messages in the room are from Telegram users
      let telegramSender = null;
      try {
        const timeline = room.getLiveTimeline && room.getLiveTimeline();
        if (timeline) {
          const events = timeline.getEvents && timeline.getEvents();
          if (events && events.length > 0) {
            // Find the first event from a Telegram sender
            for (let i = events.length - 1; i >= 0; i--) {
              const event = events[i];
              const sender = event.getSender && event.getSender();
              if (sender && (
                sender.includes('@telegram_') ||
                sender.includes(':telegram') ||
                sender.includes('telegram')
              )) {
                telegramSender = sender;
                break;
              }
            }
          }
        }
      } catch (timelineError) {
        // Timeline might not be accessible
      }

      // Get the other users in direct chats (excluding the current user and bots)
      const otherMembers = allMembers.filter(
        member => member.userId !== userId &&
                 !member.userId.includes('telegram') &&
                 !member.userId.includes('bot')
      );

      // For Telegram rooms, we need to extract the contact info from the room state or messages
      let telegramContact = null;
      let isTelegramRoom = false;

      // Check for Telegram-specific invite events
      let hasTelegramInvite = false;
      if (roomState === 'invite') {
        try {
          // Check if the inviter is a Telegram-related user
          const memberEvents = room.currentState.getStateEvents('m.room.member');
          const myMemberEvent = memberEvents.find(event =>
            event.getStateKey() === userId &&
            event.getContent().membership === 'invite'
          );

          if (myMemberEvent) {
            const inviter = myMemberEvent.getSender();
            hasTelegramInvite = inviter && (
              inviter.includes('@telegram_') ||
              inviter.includes(':telegram') ||
              inviter.includes('telegram') ||
              inviter === '@telegrambot:dfix-hsbridge.duckdns.org'
            );
          }
        } catch (inviteError) {
          // Ignore errors checking invite events
        }
      }

      // Check if this is a Telegram room
      if (telegramBot || telegramSender || hasTelegramInvite || (roomState === 'invite' && (room.name || '').includes('Telegram'))) {
        isTelegramRoom = true;

        // If we found a Telegram sender, extract contact info from the sender ID
        if (telegramSender) {
          // Extract user ID from sender (e.g., @telegram_1234567890:domain.com -> 1234567890)
          const userIdMatch = telegramSender.match(/@telegram_(\d+)/) || telegramSender.match(/telegram_(\d+)/);
          if (userIdMatch) {
            const telegramId = userIdMatch[1];
            telegramContact = {
              id: telegramId,
              username: `telegram_${telegramId}`,
              firstName: room.name || 'Telegram User',
              lastName: '',
              avatar: null
            };
          }
        }

        // Try to extract Telegram contact info from room state
        try {
          const stateEvents = room.currentState.getStateEvents('io.dailyfix.telegram');
          if (stateEvents && stateEvents.length > 0) {
            const content = stateEvents[0].getContent();
            if (content.username) {
              telegramContact = {
                id: content.username,
                username: content.username,
                firstName: content.firstName || content.username,
                lastName: content.lastName || '',
                avatar: content.avatar || null
              };
            }
          }
        } catch (error) {
          // State event might not exist
        }

        // If no state events, try to extract from room name
        if (!telegramContact) {
          const roomName = room.name || '';
          const usernameMatch = roomName.match(/Telegram \(([^)]+)\)/) ||
                              roomName.match(/tg_([\w\d_]+)/) ||
                              roomName.match(/@([\w\d_]+)/);

          if (usernameMatch) {
            const username = usernameMatch[1];
            telegramContact = {
              id: username,
              username: username,
              firstName: username,
              lastName: '',
              avatar: null
            };
          }
        }

        // If still no contact info, try to extract from messages
        if (!telegramContact) {
          try {
            const timeline = room.getLiveTimeline && room.getLiveTimeline();
            if (timeline) {
              const events = timeline.getEvents && timeline.getEvents() || [];
              for (let i = events.length - 1; i >= 0; i--) {
                const event = events[i];
                if (event.getType() === 'm.room.message' && telegramBot && event.getSender() === telegramBot.userId) {
                  const content = event.getContent();
                  const messageText = content.body || '';

                  // Look for messages that might contain username info
                  const usernameMatch = messageText.match(/logged in as @([\w\d_]+)/) ||
                                      messageText.match(/from @([\w\d_]+)/) ||
                                      messageText.match(/user @([\w\d_]+)/);

                  if (usernameMatch) {
                    const username = usernameMatch[1];
                    telegramContact = {
                      id: username,
                      username: username,
                      firstName: username,
                      lastName: '',
                      avatar: null
                    };
                    break;
                  }
                }
              }
            }
          } catch (messageError) {
            // Ignore errors extracting from messages
          }
        }
      }

      // Determine if this is a group chat
      const isGroup = otherMembers.length > 1 ||
                     room.name?.includes('group') ||
                     room.name?.includes('channel');

      // Get the latest event timestamp
      let events = [];
      let timestamp = Date.now();
      try {
        const timeline = room.getLiveTimeline && room.getLiveTimeline();
        if (timeline) {
          events = timeline.getEvents && timeline.getEvents() || [];
          const latestEvent = events.length > 0 ? events[events.length - 1] : null;
          timestamp = latestEvent ? latestEvent.getTs() : (room.getLastActiveTimestamp && room.getLastActiveTimestamp()) || Date.now();
        }
      } catch (timelineError) {
        // Ignore errors getting timeline
      }

      // Get unread count
      let unreadCount = 0;
      try {
        // First try to get the notification count from the room
        unreadCount = room.getUnreadNotificationCount && room.getUnreadNotificationCount() || 0;

        // If that's 0, check if there are actually unread messages by checking read receipts
        if (unreadCount === 0 && events.length > 0) {
          // Get the user's read receipt for this room
          const readUpToId = room.getEventReadUpTo(userId);

          if (!readUpToId) {
            // If no read receipt, count all messages not from the user as unread
            unreadCount = events.filter(event =>
              event.getSender && event.getSender() !== userId &&
              event.getType && event.getType() === 'm.room.message'
            ).length;
          } else {
            // Count messages after the read receipt
            let foundReadReceipt = false;
            unreadCount = 0;

            // Iterate through events from oldest to newest
            for (let i = 0; i < events.length; i++) {
              const event = events[i];

              // Skip non-message events
              if (!event.getType || event.getType() !== 'm.room.message') {
                continue;
              }

              // Skip messages from the current user
              if (event.getSender && event.getSender() === userId) {
                continue;
              }

              // If we found the read receipt, start counting
              if (foundReadReceipt) {
                unreadCount++;
              } else if (event.getId && event.getId() === readUpToId) {
                foundReadReceipt = true;
              }
            }
          }
        }

        // Cap the unread count at 99 for display purposes
        if (unreadCount > 99) {
          unreadCount = 99;
        }
      } catch (unreadError) {
        logger.warn(`[RoomListManager] Error calculating unread count for room ${room.roomId}:`, unreadError);
        // Ignore errors getting unread count
      }

      // Get avatar URL
      const homeserverUrl = 'https://dfix-hsbridge.duckdns.org';
      let avatarUrl = null;
      try {
        avatarUrl = room.getAvatarUrl && room.getAvatarUrl(homeserverUrl, 40, 40, 'crop') || null;
      } catch (avatarError) {
        // Ignore errors getting avatar URL
      }

      // If no room avatar and it's a Telegram room with contact info, use a placeholder
      if (!avatarUrl && isTelegramRoom && telegramContact) {
        // Use telegramContact.avatar if available, otherwise use a placeholder
        avatarUrl = telegramContact.avatar ||
                   `https://ui-avatars.com/api/?name=${encodeURIComponent(telegramContact.firstName)}&background=0088cc&color=fff`;
      }

      // Get last message
      let lastMessage = '';
      try {
        const latestEvent = events.length > 0 ? events[events.length - 1] : null;
        if (latestEvent && latestEvent.getType && latestEvent.getType() === 'm.room.message') {
          const content = latestEvent.getContent && latestEvent.getContent();
          lastMessage = content && content.body || '';
        }
      } catch (messageError) {
        // Ignore errors getting last message
      }

      // Determine the display name
      let displayName = room.name;

      // If it's a Telegram room with contact info, use the contact name
      if (isTelegramRoom && telegramContact) {
        displayName = telegramContact.firstName;
        if (telegramContact.lastName) {
          displayName += ' ' + telegramContact.lastName;
        }
      }
      // If no room name, use the first other member's name
      else if (!displayName && otherMembers.length > 0) {
        displayName = otherMembers[0].name;
      }
      // If still no name, use the room ID
      else if (!displayName) {
        displayName = room.roomId.split(':')[0].substring(1);
      }

      return {
        id: room.roomId,
        name: displayName,
        avatar: avatarUrl,
        lastMessage: lastMessage,
        timestamp: timestamp,
        unreadCount: unreadCount,
        isGroup: isGroup,
        isTelegram: isTelegramRoom,
        telegramContact: telegramContact,
        members: (room.getJoinedMembers && room.getJoinedMembers() || []).length,
        room: room // Store reference to original room
      };
    });
  }

  /**
   * Sort rooms by specified criteria
   * @param {Array} rooms - List of rooms
   * @param {string} sortBy - Sort criteria
   * @returns {Array} Sorted rooms
   */
  sortRooms(rooms, sortBy = 'lastMessage') {
    switch (sortBy) {
      case 'lastMessage':
        // Sort by timestamp (most recent first)
        return [...rooms].sort((a, b) => b.timestamp - a.timestamp);

      case 'name':
        // Sort by name (alphabetically)
        return [...rooms].sort((a, b) => a.name.localeCompare(b.name));

      case 'unread':
        // Sort by unread count (most unread first)
        return [...rooms].sort((a, b) => b.unreadCount - a.unreadCount);

      default:
        return rooms;
    }
  }

  /**
   * Update a room in the room list
   * @param {string} userId - User ID
   * @param {Object} room - Matrix room
   */
  updateRoomInList(userId, room) {
    const roomList = this.roomLists.get(userId);
    if (!roomList) return;

    // Find room in list
    const index = roomList.rooms.findIndex(r => r.id === room.roomId);

    if (index >= 0) {
      // Update existing room
      const transformedRoom = this.transformRooms(userId, [room])[0];
      roomList.rooms[index] = transformedRoom;
    } else {
      // Add new room if it passes filters
      let shouldAdd = true;

      // Apply filters
      if (roomList.filters.platform) {
        const filteredRooms = this.filterRoomsByPlatform([room], roomList.filters.platform);
        shouldAdd = filteredRooms.length > 0;
      }

      if (shouldAdd) {
        const transformedRoom = this.transformRooms(userId, [room])[0];
        roomList.rooms.push(transformedRoom);
      }
    }

    // Re-sort rooms
    roomList.rooms = this.sortRooms(roomList.rooms, roomList.sortBy);

    // Update cache
    this.cacheRooms(userId, roomList.rooms);
  }

  /**
   * Update message cache for a room
   * @param {string} userId - User ID
   * @param {Object} room - Matrix room
   * @param {Object} event - Matrix event
   */
  updateMessageCache(userId, room, event) {
    if (event.getType() !== 'm.room.message') return;

    // Get or create message cache for room
    let messageCache = this.messageCache.get(room.roomId);
    if (!messageCache) {
      messageCache = {
        messages: [],
        lastUpdated: null
      };
      this.messageCache.set(room.roomId, messageCache);
    }

    // Create message object
    const message = {
      id: event.getId(),
      sender: event.getSender(),
      senderName: room.getMember(event.getSender())?.name || event.getSender(),
      content: event.getContent().body || '',
      timestamp: event.getTs(),
      type: this.getMessageType(event),
      mediaUrl: this.getMediaUrl(event),
      isFromMe: event.getSender() === userId
    };

    // Add message to cache
    messageCache.messages.push(message);
    messageCache.lastUpdated = new Date();

    // Sort messages by timestamp
    messageCache.messages.sort((a, b) => a.timestamp - b.timestamp);

    // Limit cache size (keep last 100 messages)
    if (messageCache.messages.length > 100) {
      messageCache.messages = messageCache.messages.slice(-100);
    }

    // Notify event handlers
    this.notifyMessagesUpdated(userId, room.roomId);
  }

  /**
   * Get message type from Matrix event
   * @param {Object} event - Matrix event
   * @returns {string} Message type
   */
  getMessageType(event) {
    const content = event.getContent();

    if (content.msgtype === 'm.image') {
      return 'image';
    } else if (content.msgtype === 'm.file') {
      return 'file';
    } else if (content.msgtype === 'm.audio') {
      return 'audio';
    } else if (content.msgtype === 'm.video') {
      return 'video';
    } else {
      return 'text';
    }
  }

  /**
   * Get media URL from Matrix event
   * @param {Object} event - Matrix event
   * @returns {string|null} Media URL
   */
  getMediaUrl(event) {
    const content = event.getContent();

    if (content.url) {
      return content.url;
    }

    return null;
  }

  /**
   * Cache rooms for a user
   * @param {string} userId - User ID
   * @param {Array} rooms - List of rooms
   */
  async cacheRooms(userId, rooms) {
    try {
      // Store in IndexedDB
      const roomsToCache = rooms.map(room => ({
        id: room.id,
        name: room.name,
        avatar: room.avatar,
        lastMessage: room.lastMessage,
        timestamp: room.timestamp,
        unreadCount: room.unreadCount,
        isGroup: room.isGroup,
        members: room.members
      }));

      await saveToIndexedDB(userId, {
        cachedRooms: roomsToCache,
        roomsCachedAt: new Date().toISOString()
      });

      logger.info('[RoomListManager] Rooms cached for user:', userId);
    } catch (error) {
      logger.error('[RoomListManager] Error caching rooms:', error);
    }
  }

  /**
   * Load cached rooms for a user
   * @param {string} userId - User ID
   * @returns {Array} Cached rooms
   */
  async loadCachedRooms(userId) {
    try {
      const data = await getFromIndexedDB(userId);
      if (data && data.cachedRooms) {
        logger.info('[RoomListManager] Loaded cached rooms for user:', userId);
        return data.cachedRooms;
      }
    } catch (error) {
      logger.error('[RoomListManager] Error loading cached rooms:', error);
    }

    return [];
  }

  /**
   * Notify room update event handlers
   * @param {string} userId - User ID
   */
  notifyRoomsUpdated(userId) {
    const handlers = this.eventHandlers.get(userId);
    if (handlers && handlers.onRoomsUpdated) {
      const roomList = this.roomLists.get(userId);
      handlers.onRoomsUpdated(roomList.rooms);
    }
  }

  /**
   * Notify message update event handlers
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID
   */
  notifyMessagesUpdated(userId, roomId) {
    const handlers = this.eventHandlers.get(userId);
    if (handlers && handlers.onMessagesUpdated) {
      const messageCache = this.messageCache.get(roomId);
      if (messageCache) {
        handlers.onMessagesUpdated(roomId, messageCache.messages);
      }
    }
  }

  /**
   * Get rooms for a user
   * @param {string} userId - User ID
   * @returns {Array} List of rooms
   */
  getRooms(userId) {
    const roomList = this.roomLists.get(userId);
    return roomList ? roomList.rooms : [];
  }

  /**
   * Get messages for a room
   * @param {string} roomId - Room ID
   * @param {number} limit - Maximum number of messages to return
   * @returns {Array} List of messages
   */
  getMessages(roomId, limit = 50) {
    const messageCache = this.messageCache.get(roomId);
    if (!messageCache) return [];

    // Return last 'limit' messages
    return messageCache.messages.slice(-limit);
  }

  /**
   * Load messages for a room
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID
   * @param {number} limit - Maximum number of messages to load
   * @returns {Promise<Array>} List of messages
   */
  async loadMessages(userId, roomId, limit = 50) {
    const roomList = this.roomLists.get(userId);
    if (!roomList || !roomList.client) {
      logger.error('[RoomListManager] Cannot load messages, room list not initialized for user:', userId);
      return [];
    }

    try {
      const room = roomList.client.getRoom(roomId);
      if (!room) {
        logger.error('[RoomListManager] Room not found:', roomId);
        return [];
      }

      // Get timeline events
      const timeline = room.getLiveTimeline();
      const events = timeline.getEvents();

      // Filter for message events
      const messageEvents = events
        .filter(event => event.getType() === 'm.room.message')
        .slice(-limit);

      // Transform to message format
      const messages = messageEvents.map(event => ({
        id: event.getId(),
        sender: event.getSender(),
        senderName: room.getMember(event.getSender())?.name || event.getSender(),
        content: event.getContent().body || '',
        timestamp: event.getTs(),
        type: this.getMessageType(event),
        mediaUrl: this.getMediaUrl(event),
        isFromMe: event.getSender() === userId
      }));

      // Cache messages
      this.messageCache.set(roomId, {
        messages,
        lastUpdated: new Date()
      });

      return messages;
    } catch (error) {
      logger.error('[RoomListManager] Error loading messages:', error);
      return [];
    }
  }

  /**
   * Send a message to a room
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID
   * @param {string|Object} content - Message content
   * @returns {Promise<Object>} Send response
   */
  async sendMessage(userId, roomId, content) {
    const roomList = this.roomLists.get(userId);
    if (!roomList || !roomList.client) {
      throw new Error('Room list not initialized for user');
    }

    try {
      // If content is a string, convert to proper message format
      const messageContent = typeof content === 'string'
        ? { msgtype: 'm.text', body: content }
        : content;

      return await roomList.client.sendMessage(roomId, messageContent);
    } catch (error) {
      logger.error('[RoomListManager] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Clean up resources for a user
   * @param {string} userId - User ID
   */
  cleanup(userId) {
    // Clean up event listeners
    this.cleanupEventListeners(userId);

    // Remove room list
    this.roomLists.delete(userId);

    // Remove sync status
    this.syncInProgress.delete(userId);

    // Remove event handlers
    this.eventHandlers.delete(userId);

    logger.info('[RoomListManager] Cleaned up resources for user:', userId);
  }
}

// Export singleton instance
const roomListManager = new RoomListManager();
export default roomListManager;
