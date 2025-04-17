import React, { useState, useEffect, useRef } from 'react';
import { FiSearch, FiRefreshCw, FiMessageCircle, FiUsers, FiAlertCircle, FiPlus, FiFilter, FiSettings } from 'react-icons/fi';
import { FaTelegram } from 'react-icons/fa';
import { useMatrixClient } from '../context/MatrixClientContext';
import { toast } from 'react-hot-toast';
import roomListManager from '../utils/roomListManager';
import logger from '../utils/logger';
import contactOrganizer, { ContactCategories } from '../utils/contactOrganizer';
import ContactCategory from './ContactCategory';

const TelegramContactList = ({ onContactSelect, selectedContactId }) => {
  const { client, loading: clientLoading } = useMatrixClient() || {};
  const [contacts, setContacts] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Organization state
  const [organizedContacts, setOrganizedContacts] = useState({});
  const [pinnedContactIds, setPinnedContactIds] = useState([]);
  const [mutedContactIds, setMutedContactIds] = useState([]);
  const [archivedContactIds, setArchivedContactIds] = useState([]);
  const [showMuted, setShowMuted] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  // Reference to track if we've already tried to load contacts
  const hasTriedLoading = useRef(false);

  // Initialize room list manager on component mount
  useEffect(() => {
    // Track if the component is mounted
    let isMounted = true;

    const initializeContacts = async () => {
      if (!client || !isMounted || clientLoading) return;

      try {
        // Check if the Matrix client is ready
        const syncState = client.getSyncState();
        logger.info(`[TelegramContactList] Initial Matrix client sync state: ${syncState}`);

        // Initialize room list with Telegram filter
        roomListManager.initRoomList(
          client.getUserId(),
          client,
          {
            filters: { platform: 'telegram' },
            sortBy: 'lastMessage',
            onMessagesUpdated: handleMessagesUpdated
          },
          handleRoomsUpdated
        );

        // If the client is not ready, wait for it to be ready
        if (syncState !== 'PREPARED' && syncState !== 'SYNCING') {
          logger.warn('[TelegramContactList] Matrix client not ready, waiting for sync state change');

          // Set up a one-time sync state change listener
          const syncStateHandler = (state, prevState) => {
            logger.info(`[TelegramContactList] Sync state changed: ${prevState} -> ${state}`);
            if ((state === 'PREPARED' || state === 'SYNCING') && isMounted) {
              // Remove the listener to avoid memory leaks
              client.removeListener('sync', syncStateHandler);
              // Load contacts now that the client is ready
              loadContacts();
            }
          };

          client.on('sync', syncStateHandler);

          // Also set a timeout to load contacts anyway after 3 seconds
          setTimeout(() => {
            if (isMounted) {
              client.removeListener('sync', syncStateHandler);
              logger.warn('[TelegramContactList] Timeout waiting for sync, loading contacts anyway');
              loadContacts();

              // Force a refresh after a short delay if we still don't have contacts
              setTimeout(() => {
                if (isMounted && contacts.length === 0) {
                  logger.warn('[TelegramContactList] Still no contacts after timeout, forcing refresh');
                  handleRefresh();
                }
              }, 2000);
            }
          }, 3000);
        } else {
          // Load cached contacts first
          await loadCachedContacts();

          // Then load fresh contacts
          loadContacts();

          // Force an immediate sync
          roomListManager.syncRooms(client.getUserId(), true);
        }
      } catch (error) {
        logger.error('[TelegramContactList] Error initializing contacts:', error);

        // Try to load contacts anyway
        if (isMounted) {
          loadContacts();
        }
      }
    };

    initializeContacts();

    return () => {
      // Mark component as unmounted
      isMounted = false;

      // Clean up room list manager
      if (client) {
        try {
          roomListManager.cleanup(client.getUserId());
        } catch (error) {
          logger.error('[TelegramContactList] Error cleaning up room list manager:', error);
        }
      }
    };
  }, [client, clientLoading]);

  // Handle rooms updated event
  const handleRoomsUpdated = (rooms) => {
    logger.info('[TelegramContactList] Rooms updated:', rooms.length);
    setContacts(rooms);
    setFilteredContacts(rooms);
    setLoading(false);
  };

  // Handle messages updated event
  const handleMessagesUpdated = (roomId, messages) => {
    // Update the contact with the latest message
    setContacts(prevContacts => {
      const updatedContacts = [...prevContacts];
      const contactIndex = updatedContacts.findIndex(contact => contact.id === roomId);

      if (contactIndex >= 0 && messages.length > 0) {
        const latestMessage = messages[messages.length - 1];
        updatedContacts[contactIndex] = {
          ...updatedContacts[contactIndex],
          lastMessage: latestMessage.content,
          timestamp: latestMessage.timestamp
        };
      }

      // Re-sort contacts by timestamp
      return updatedContacts.sort((a, b) => b.timestamp - a.timestamp);
    });
  };

  // Filter contacts when search query changes
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredContacts(contacts);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = contacts.filter(contact =>
        contact.name.toLowerCase().includes(query)
      );
      setFilteredContacts(filtered);
    }
  }, [searchQuery, contacts]);

  // Load cached contacts from IndexedDB
  const loadCachedContacts = async () => {
    try {
      if (!client) return [];

      const userId = client.getUserId();
      // Use Promise.resolve to ensure we're handling the return value as a Promise
      const cachedContacts = await Promise.resolve(roomListManager.loadCachedRooms(userId) || []);

      if (cachedContacts && cachedContacts.length > 0) {
        logger.info('[TelegramContactList] Loaded cached contacts:', cachedContacts.length);

        // Filter for Telegram contacts only
        const telegramContacts = cachedContacts.filter(contact => contact.isTelegram);

        if (telegramContacts.length > 0) {
          logger.info('[TelegramContactList] Found cached Telegram contacts:', telegramContacts.length);
          setContacts(telegramContacts);
          setFilteredContacts(telegramContacts);
          setLoading(false);
          return telegramContacts;
        }
      }

      return [];
    } catch (error) {
      logger.error('[TelegramContactList] Error loading cached contacts:', error);
      // Continue with fresh load
      return [];
    }
  };

  // Load contacts using RoomListManager
  const loadContacts = async () => {
    setError(null);
    setLoading(true);

    // Declare telegramRooms at the function level so it's accessible throughout
    let telegramRooms = [];

    try {
      if (!client) {
        throw new Error('Matrix client not initialized');
      }

      // Check if the Matrix client is ready
      const syncState = client.getSyncState();
      logger.info(`[TelegramContactList] Matrix client sync state: ${syncState}`);

      // If the client is not ready, wait a moment
      if (syncState !== 'PREPARED' && syncState !== 'SYNCING') {
        logger.warn('[TelegramContactList] Matrix client not ready, waiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Try to load cached contacts first
      const cachedContacts = await loadCachedContacts();
      if (cachedContacts && cachedContacts.length > 0) {
        logger.info(`[TelegramContactList] Using ${cachedContacts.length} cached contacts`);
        return; // We already set the contacts in loadCachedContacts
      }

      // CRITICAL FIX: Always sync all rooms to find all Telegram rooms

      // Note the Telegram room from localStorage for reference, but don't limit to just this room
      let knownTelegramRoomId = null;
      try {
        const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
        knownTelegramRoomId = connectionStatus.telegramRoomId;

        if (knownTelegramRoomId) {
          logger.info('[TelegramContactList] Found Telegram room ID in localStorage:', knownTelegramRoomId);
        }
      } catch (directRoomError) {
        logger.warn('[TelegramContactList] Error getting room from localStorage:', directRoomError);
      }

      // Always sync rooms to find ALL Telegram rooms
      try {
        // Trigger a sync in the room list manager
        const userId = client.getUserId();

        // Force a sync of all rooms
        logger.info('[TelegramContactList] Forcing sync of all rooms');

        // First, get all rooms directly from the client
        const allClientRooms = client.getRooms() || [];
        logger.info(`[TelegramContactList] Found ${allClientRooms.length} total rooms directly from client`);

        // Log all rooms for debugging
        allClientRooms.forEach((room, index) => {
            try {
              // Get room membership state
              let roomState = 'unknown';
              try {
                if (room.getMyMembership) {
                  roomState = room.getMyMembership();
                }
              } catch (stateError) {
                // Ignore errors getting room state
              }

              // Get joined members
              const joinedMembers = room.getJoinedMembers() || [];
              const joinedMemberIds = joinedMembers.map(m => m.userId).join(', ');

              // Get invited members
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

              // Check for inviter if this is an invited room
              let inviter = 'unknown';
              if (roomState === 'invite') {
                try {
                  const memberEvents = room.currentState.getStateEvents('m.room.member');
                  const myMemberEvent = memberEvents.find(event =>
                    event.getStateKey() === userId &&
                    event.getContent().membership === 'invite'
                  );

                  if (myMemberEvent) {
                    inviter = myMemberEvent.getSender() || 'unknown';
                  }
                } catch (inviteError) {
                  // Ignore errors checking invite events
                }
              }

              logger.info(`[TelegramContactList] Room ${index}: ${room.roomId} - ${room.name} - State: ${roomState}${roomState === 'invite' ? ` - Inviter: ${inviter}` : ''} - Joined: ${joinedMemberIds} - Invited: ${invitedMemberIds}`);

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
                      logger.info(`[TelegramContactList] Found ${telegramEvents.length} Telegram events in room ${room.roomId}`);
                      telegramEvents.forEach((event, eventIndex) => {
                        logger.info(`[TelegramContactList] Telegram event ${eventIndex} in room ${room.roomId}: sender=${event.getSender()}, type=${event.getType()}`);
                      });
                    }
                  }
                }
              } catch (timelineError) {
                // Timeline might not be accessible
              }
            } catch (roomError) {
              logger.error(`[TelegramContactList] Error getting room details for room ${index}:`, roomError);
            }
          });

          // Now sync rooms through the room list manager
          try {
            const syncedRooms = await roomListManager.syncRooms(userId, true);

            // Filter for Telegram rooms
            if (syncedRooms && Array.isArray(syncedRooms)) {
              telegramRooms = syncedRooms.filter(room => room.isTelegram);
              logger.info(`[TelegramContactList] Found ${telegramRooms.length} Telegram rooms via sync`);
            } else {
              logger.warn('[TelegramContactList] syncRooms did not return an array of rooms');
            }
          } catch (syncError) {
            logger.error('[TelegramContactList] Error syncing rooms:', syncError);
            // Continue with any rooms we found directly
          }

          // If we still don't have any rooms, try to get the Telegram room directly from the client
          if (telegramRooms.length === 0) {
            logger.info('[TelegramContactList] No Telegram rooms found via sync, checking all rooms');

            // Get all rooms from the client
            const allRooms = client.getRooms() || [];
            logger.info(`[TelegramContactList] Found ${allRooms.length} total rooms`);

            // Log all rooms for debugging
            allRooms.forEach((room, index) => {
              try {
                const members = room.getJoinedMembers() || [];
                const memberIds = members.map(m => m.userId).join(', ');
                logger.info(`[TelegramContactList] Room ${index}: ${room.roomId} - ${room.name} - Members: ${memberIds}`);
              } catch (error) {
                logger.error(`[TelegramContactList] Error getting room details for room ${index}:`, error);
              }
            });

            // Check if any of the rooms has the Telegram bot as a member
            const telegramRoom = allRooms.find(room => {
              try {
                const members = room.getJoinedMembers() || [];
                return members.some(member =>
                  member.userId === '@telegrambot:dfix-hsbridge.duckdns.org' ||
                  member.userId.includes('telegram') ||
                  member.name?.includes('Telegram')
                );
              } catch (error) {
                return false;
              }
            });

            if (telegramRoom) {
              logger.info(`[TelegramContactList] Found Telegram room directly: ${telegramRoom.roomId}`);

              // Create a contact from this room
              const contact = {
                id: telegramRoom.roomId,
                name: telegramRoom.name || 'Telegram',
                avatar: telegramRoom.getAvatarUrl('https://dfix-hsbridge.duckdns.org', 96, 96, 'crop'),
                lastMessage: 'Connected to Telegram',
                timestamp: Date.now(),
                unreadCount: 0,
                isGroup: false,
                isTelegram: true,
                members: telegramRoom.getJoinedMembers().length,
                telegramContact: {
                  id: 'telegram_user',
                  username: 'telegram_user',
                  firstName: 'Telegram',
                  lastName: '',
                  avatar: null
                }
              };

              telegramRooms = [contact];

              // Save the room ID to localStorage
              try {
                const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
                connectionStatus.telegramRoomId = telegramRoom.roomId;
                localStorage.setItem('dailyfix_connection_status', JSON.stringify(connectionStatus));
                logger.info(`[TelegramContactList] Saved Telegram room ID to localStorage: ${telegramRoom.roomId}`);
              } catch (error) {
                logger.error('[TelegramContactList] Error saving Telegram room ID to localStorage:', error);
              }
            }
          }
        } catch (syncError) {
          logger.error('[TelegramContactList] Error syncing rooms:', syncError);
        }
      } catch (mainError) {
        logger.error('[TelegramContactList] Error in main try block:', mainError);
      }

      // If we still don't have any rooms, create a placeholder
      if (telegramRooms.length === 0) {
        logger.warn('[TelegramContactList] No Telegram rooms found, creating placeholder');

        // Check if we have a Telegram room ID in localStorage
        try {
          const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
          const telegramRoomId = connectionStatus.telegramRoomId;

          if (telegramRoomId) {
            // Create a placeholder with the room ID
            const placeholderContact = {
              id: telegramRoomId,
              name: 'Telegram',
              avatar: null,
              lastMessage: 'Connected to Telegram',
              timestamp: Date.now(),
              unreadCount: 0,
              isGroup: false,
              isTelegram: true,
              telegramContact: {
                id: 'telegram_user',
                username: 'telegram_user',
                firstName: 'Telegram',
                lastName: '',
                avatar: null
              },
              members: 1,
              isPlaceholder: true
            };

            telegramRooms = [placeholderContact];
          } else {
            // Create a generic placeholder
            const placeholderContact = {
              id: 'telegram_placeholder',
              name: 'Telegram',
              avatar: null,
              lastMessage: 'Connected to Telegram',
              timestamp: Date.now(),
              unreadCount: 0,
              isGroup: false,
              isTelegram: true,
              telegramContact: {
                id: 'telegram_user',
                username: 'telegram_user',
                firstName: 'Telegram',
                lastName: '',
                avatar: null
              },
              members: 1,
              isPlaceholder: true
            };

            telegramRooms = [placeholderContact];
          }
        } catch (error) {
          // Create a generic placeholder
          const placeholderContact = {
            id: 'telegram_placeholder',
            name: 'Telegram',
            avatar: null,
            lastMessage: 'Connected to Telegram',
            timestamp: Date.now(),
            unreadCount: 0,
            isGroup: false,
            isTelegram: true,
            telegramContact: {
              id: 'telegram_user',
              username: 'telegram_user',
              firstName: 'Telegram',
              lastName: '',
              avatar: null
            },
            members: 1,
            isPlaceholder: true
          };

          telegramRooms = [placeholderContact];
        }
      }

      try {
        // Update the contacts
        setContacts(telegramRooms);
        setFilteredContacts(telegramRooms);
        logger.info(`[TelegramContactList] Successfully loaded ${telegramRooms.length} Telegram contacts`);
      } catch (error) {
        logger.error('[TelegramContactList] Error loading contacts:', error);
        setError('Failed to load Telegram contacts');

        // Show a placeholder contact even if there's an error
        const errorPlaceholder = {
          id: 'telegram_error',
          name: 'Telegram',
          avatar: null,
          lastMessage: 'There was an error loading your contacts. Tap to retry.',
          timestamp: Date.now(),
          unreadCount: 0,
          isGroup: false,
          isTelegram: true,
          isPlaceholder: true,
          isError: true
        };

        setContacts([errorPlaceholder]);
        setFilteredContacts([errorPlaceholder]);
      } finally {
        setLoading(false);
      }
  };

  const handleRefresh = async () => {
    if (refreshing) return;

    setRefreshing(true);
    // Reset the loading flag
    hasTriedLoading.current = false;

    // Show immediate feedback
    toast.loading('Refreshing conversations...', { id: 'refresh-toast' });

    try {
      // First try to get contacts from localStorage
      const cachedContacts = await loadCachedContacts();

      // If we have cached contacts, show them immediately
      if (cachedContacts && cachedContacts.length > 0) {
        logger.info(`[TelegramContactList] Using ${cachedContacts.length} cached contacts while refreshing`);
        // We already set the contacts in loadCachedContacts
      } else {
        // Clear any existing contacts to show loading state
        setContacts([]);
        setFilteredContacts([]);
      }

      // CRITICAL FIX: Force a resync of all rooms from the Matrix client
      logger.info('[TelegramContactList] Forcing resync of all rooms from Matrix client');

      // First, clear the room list cache
      try {
        if (client) {
          const userId = client.getUserId();
          roomListManager.cleanup(userId);
          logger.info('[TelegramContactList] Cleared room list cache');
        }
      } catch (cleanupError) {
        logger.error('[TelegramContactList] Error clearing room list cache:', cleanupError);
      }

      // Force the Matrix client to sync
      try {
        if (client) {
          // Force a sync
          logger.info('[TelegramContactList] Forcing Matrix client sync');
          // Don't call startClient() as it's already started
          // Instead, force a sync by calling syncLeftRooms()
          if (client.syncLeftRooms) {
            await client.syncLeftRooms();
          }
          logger.info('[TelegramContactList] Matrix client sync requested');
        }
      } catch (syncError) {
        logger.error('[TelegramContactList] Error forcing Matrix client sync:', syncError);
      }

      // Initialize room list with Telegram filter
      try {
        if (client) {
          const userId = client.getUserId();
          logger.info('[TelegramContactList] Reinitializing room list');
          roomListManager.initRoomList(
            userId,
            client,
            {
              filters: { platform: 'telegram' },
              sortBy: 'lastMessage',
              onMessagesUpdated: handleMessagesUpdated
            },
            handleRoomsUpdated
          );
        }
      } catch (initError) {
        logger.error('[TelegramContactList] Error reinitializing room list:', initError);
      }

      // Force a sync of all rooms
      try {
        if (client) {
          const userId = client.getUserId();
          logger.info('[TelegramContactList] Forcing sync of all rooms');
          const syncedRooms = await roomListManager.syncRooms(userId, true);
          logger.info(`[TelegramContactList] Synced ${syncedRooms.length} rooms`);

          // Check if any of the synced rooms are Telegram rooms
          const telegramRooms = syncedRooms.filter(room => room.isTelegram);
          logger.info(`[TelegramContactList] Found ${telegramRooms.length} Telegram rooms in synced rooms`);

          // If we found Telegram rooms, update the contacts
          if (telegramRooms.length > 0) {
            setContacts(telegramRooms);
            setFilteredContacts(telegramRooms);
          }
        }
      } catch (roomSyncError) {
        logger.error('[TelegramContactList] Error syncing rooms:', roomSyncError);
      }

      // Load contacts with a timeout to prevent hanging
      const loadPromise = loadContacts();
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          logger.warn('[TelegramContactList] Contact loading timed out');
          resolve();
        }, 5000);
      });

      await Promise.race([loadPromise, timeoutPromise]);

      // Check if we have any contacts after all our efforts
      if (contacts.length === 0) {
        // Last resort: Try to create a placeholder contact
        try {
          const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
          const telegramRoomId = connectionStatus.telegramRoomId;

          if (telegramRoomId && client) {
            const telegramRoom = client.getRoom(telegramRoomId);
            if (telegramRoom) {
              const contact = {
                id: telegramRoom.roomId,
                name: telegramRoom.name || 'Telegram',
                avatar: telegramRoom.getAvatarUrl('https://dfix-hsbridge.duckdns.org', 96, 96, 'crop'),
                lastMessage: 'Connected to Telegram',
                timestamp: Date.now(),
                unreadCount: 0,
                isGroup: false,
                isTelegram: true,
                members: telegramRoom.getJoinedMembers().length,
                telegramContact: {
                  id: 'telegram_user',
                  username: 'telegram_user',
                  firstName: 'Telegram',
                  lastName: '',
                  avatar: null
                }
              };

              setContacts([contact]);
              setFilteredContacts([contact]);
              logger.info('[TelegramContactList] Created placeholder contact from known Telegram room');
            }
          }
        } catch (placeholderError) {
          logger.error('[TelegramContactList] Error creating placeholder contact:', placeholderError);
        }
      }

      // Show different messages based on refresh count to make it more engaging
      const refreshMessages = [
        "Refreshed conversations!",
        "Latest conversations loaded!",
        "Telegram updated successfully!",
        "All fresh and up-to-date!",
        "Telegram synced successfully!"
      ];
      const randomMessage = refreshMessages[Math.floor(Math.random() * refreshMessages.length)];
      toast.success(randomMessage, { id: 'refresh-toast' });
    } catch (error) {
      logger.error('[TelegramContactList] Error refreshing contacts:', error);
      toast.error('Refresh completed with some issues');

      // Try to load contacts directly as a fallback
      try {
        const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
        const telegramRoomId = connectionStatus.telegramRoomId;

        if (telegramRoomId && client) {
          const telegramRoom = client.getRoom(telegramRoomId);
          if (telegramRoom) {
            const contact = {
              id: telegramRoom.roomId,
              name: telegramRoom.name || 'Telegram',
              avatar: telegramRoom.getAvatarUrl('https://dfix-hsbridge.duckdns.org', 96, 96, 'crop'),
              lastMessage: 'Connected to Telegram',
              timestamp: Date.now(),
              unreadCount: 0,
              isGroup: false,
              isTelegram: true,
              members: telegramRoom.getJoinedMembers().length,
              telegramContact: {
                id: 'telegram_user',
                username: 'telegram_user',
                firstName: 'Telegram',
                lastName: '',
                avatar: null
              }
            };

            setContacts([contact]);
            setFilteredContacts([contact]);
          }
        }
      } catch (fallbackError) {
        logger.error('[TelegramContactList] Fallback error:', fallbackError);
      }
    } finally {
      // Add a small delay for better UX
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // We already imported LoadingState at the top

  // We already defined hasTriedLoading at the top

  // Function to organize contacts
  const organizeContactList = () => {
    if (!contacts || contacts.length === 0) return;

    const options = {
      pinnedContactIds,
      mutedContactIds,
      archivedContactIds,
      showMuted,
      showArchived,
      mentionKeywords: ['@me', '@all']
    };

    const organized = contactOrganizer.organizeContacts(contacts, options);
    setOrganizedContacts(organized);
  };

  // Organize contacts whenever they change
  useEffect(() => {
    organizeContactList();
  }, [contacts, pinnedContactIds, mutedContactIds, archivedContactIds, showMuted, showArchived]);

  // Function to toggle pin status for a contact
  const togglePinContact = (contactId) => {
    if (pinnedContactIds.includes(contactId)) {
      setPinnedContactIds(pinnedContactIds.filter(id => id !== contactId));
    } else {
      setPinnedContactIds([...pinnedContactIds, contactId]);
    }
  };

  // Function to toggle mute status for a contact
  const toggleMuteContact = (contactId) => {
    if (mutedContactIds.includes(contactId)) {
      setMutedContactIds(mutedContactIds.filter(id => id !== contactId));
    } else {
      setMutedContactIds([...mutedContactIds, contactId]);
    }
  };

  // Function to toggle archive status for a contact
  const toggleArchiveContact = (contactId) => {
    if (archivedContactIds.includes(contactId)) {
      setArchivedContactIds(archivedContactIds.filter(id => id !== contactId));
    } else {
      setArchivedContactIds([...archivedContactIds, contactId]);
    }
  };

  // If we've been loading for too long, try to load contacts directly
  useEffect(() => {
    if (loading && !hasTriedLoading.current && client) {
      hasTriedLoading.current = true;

      // Set a timeout to check if we're still loading after 5 seconds
      const directLoadTimer = setTimeout(async () => {
        if (loading) {
          logger.info('[TelegramContactList] Still loading after timeout, trying direct room fetch');

          try {
            // Try to get the Telegram room directly from localStorage
            const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
            const telegramRoomId = connectionStatus.telegramRoomId;

            if (telegramRoomId) {
              logger.info('[TelegramContactList] Found Telegram room ID in localStorage:', telegramRoomId);

              // Try to get the room directly
              const telegramRoom = client.getRoom(telegramRoomId);
              if (telegramRoom) {
                logger.info('[TelegramContactList] Found Telegram room:', telegramRoom.name);

                // Create a contact from this room
                const contact = {
                  id: telegramRoom.roomId,
                  name: telegramRoom.name || 'Telegram',
                  avatar: telegramRoom.getAvatarUrl('https://dfix-hsbridge.duckdns.org', 96, 96, 'crop'),
                  lastMessage: 'Connected to Telegram',
                  timestamp: Date.now(),
                  unreadCount: 0,
                  isGroup: false,
                  isTelegram: true,
                  members: telegramRoom.getJoinedMembers().length
                };

                setContacts([contact]);
                setFilteredContacts([contact]);
                setLoading(false);
              }
            }
          } catch (error) {
            logger.error('[TelegramContactList] Error in direct room fetch:', error);
          }

          // If we still don't have contacts, show a placeholder
          if (contacts.length === 0) {
            const placeholderContact = {
              id: 'telegram_placeholder',
              name: 'Telegram',
              avatar: null,
              lastMessage: 'Connected to Telegram',
              timestamp: Date.now(),
              unreadCount: 0,
              isGroup: false,
              isTelegram: true,
              members: 1,
              isPlaceholder: true
            };

            setContacts([placeholderContact]);
            setFilteredContacts([placeholderContact]);
            setLoading(false);
          }
        }
      }, 8000);

      return () => clearTimeout(directLoadTimer);
    }
  }, [loading, client, contacts]);

  if (loading) {
    return (
      <div className="p-6 h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <FaTelegram className="text-[#0088cc] text-2xl mr-2" />
            <h2 className="text-xl font-semibold text-white">Telegram</h2>
          </div>
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-[#0088cc] animate-spin"></div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-6 max-w-md">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-[#0088cc] animate-spin"></div>
              <div className="absolute inset-3 rounded-full border-2 border-t-transparent border-[#0088cc] animate-spin animation-delay-150"></div>
              <FaTelegram className="absolute inset-0 m-auto text-[#0088cc] text-2xl" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Loading Conversations</h3>
            <p className="text-gray-400 mb-6">Setting up your Telegram connection</p>
            <button
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm text-white transition-colors"
              onClick={() => {
                // Try to refresh contacts
                logger.info('[TelegramContactList] Manual refresh requested');
                loadContacts();

                // If we've been loading for too long, show a placeholder
                setTimeout(() => {
                  if (loading) {
                    logger.warn('[TelegramContactList] Still loading after manual refresh, showing placeholder');

                    const placeholderContact = {
                      id: 'telegram_placeholder',
                      name: 'Telegram',
                      avatar: null,
                      lastMessage: 'Connected to Telegram',
                      timestamp: Date.now(),
                      unreadCount: 0,
                      isGroup: false,
                      isTelegram: true,
                      members: 1,
                      isPlaceholder: true
                    };
                    setContacts([placeholderContact]);
                    setFilteredContacts([placeholderContact]);
                    setLoading(false);
                  }
                }, 5000);
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Telegram</h2>
          <button
            className="p-2 bg-neutral-800 rounded-full text-gray-400 hover:text-white transition-colors"
            onClick={handleRefresh}
          >
            <FiRefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="bg-red-500 bg-opacity-10 p-6 rounded-full mb-6 inline-block">
              <FiAlertCircle className="text-red-500 text-4xl" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Something went wrong</h3>
            <p className="text-gray-400 mb-6">{error}</p>
            <button
              onClick={loadContacts}
              className="px-6 py-3 bg-[#0088cc] text-white rounded-lg hover:bg-[#0099dd] transition-colors flex items-center justify-center mx-auto"
            >
              <FiRefreshCw className="mr-2" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render loading state if client is loading
  if (clientLoading) {
    return (
      <div className="flex flex-col h-full bg-gray-900 text-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-6 max-w-md">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-[#0088cc] animate-spin"></div>
              <div className="absolute inset-3 rounded-full border-2 border-t-transparent border-[#0088cc] animate-spin animation-delay-150"></div>
              <FaTelegram className="absolute inset-0 m-auto text-[#0088cc] text-2xl" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Loading Telegram</h3>
            <p className="text-gray-400 mb-4">Setting up your secure connection</p>
            <button
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm text-white transition-colors"
              onClick={() => {
                // Refresh the page as a last resort
                window.location.reload();
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <FaTelegram className="text-[#0088cc] text-2xl mr-2" />
          <h2 className="text-xl font-semibold text-white">Telegram</h2>
        </div>
        <div className="flex items-center space-x-2">
          <button
            className="p-2 w-auto bg-neutral-800 rounded-full text-gray-400 hover:text-white transition-colors"
            onClick={() => setShowArchived(!showArchived)}
            title={showArchived ? 'Hide archived' : 'Show archived'}
          >
            <FiSettings className="w-5 h-5" />
          </button>
          <button
            className="p-2 w-auto bg-neutral-800 rounded-full text-gray-400 hover:text-white transition-colors"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FiRefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Search conversations..."
          className="w-full bg-neutral-800 text-white rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#0088cc] transition-all duration-200"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
      </div>

      {filteredContacts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="bg-gray-800 p-6 rounded-full mb-4 inline-block">
              <FiMessageCircle className="w-8 h-8 text-[#0088cc] mx-auto" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">No conversations found</h3>
            <p className="text-gray-400">
              {searchQuery
                ? `No results for "${searchQuery}". Try a different search term.`
                : 'Connect with Telegram to start messaging.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4">
            {/* Filter controls */}
            <div className="flex items-center justify-between px-2 py-2 bg-neutral-800 rounded-md">
              <div className="flex items-center space-x-2">
                <FiFilter className="text-gray-400" />
                <span className="text-sm text-white">Filter</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${activeFilter === 'all' ? 'bg-[#0088cc] text-white' : 'bg-neutral-700 text-gray-300'}`}
                  onClick={() => setActiveFilter('all')}
                >
                  All
                </button>
                <button
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${activeFilter === 'unread' ? 'bg-[#0088cc] text-white' : 'bg-neutral-700 text-gray-300'}`}
                  onClick={() => setActiveFilter('unread')}
                >
                  Unread
                </button>
                <button
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${showMuted ? 'bg-neutral-700 text-gray-300' : 'bg-red-500 text-white'}`}
                  onClick={() => setShowMuted(!showMuted)}
                >
                  {showMuted ? 'Hide Muted' : 'Show Muted'}
                </button>
              </div>
            </div>

            {/* Organized contacts by category */}
            {Object.keys(ContactCategories).map(categoryKey => {
              const category = ContactCategories[categoryKey];
              const categoryContacts = organizedContacts[category] || [];

              // Skip empty categories
              if (categoryContacts.length === 0) return null;

              // Skip categories based on filter
              if (activeFilter === 'unread' &&
                  category !== ContactCategories.UNREAD &&
                  category !== ContactCategories.MENTIONS &&
                  category !== ContactCategories.PRIORITY) {
                return null;
              }

              return (
                <ContactCategory
                  key={category}
                  category={category}
                  contacts={categoryContacts}
                  onContactSelect={onContactSelect}
                  selectedContactId={selectedContactId}
                  isExpanded={true}
                  onPinContact={togglePinContact}
                  onMuteContact={toggleMuteContact}
                  onArchiveContact={toggleArchiveContact}
                />
              );
            })}

            {/* If no organized contacts are shown, show all contacts */}
            {Object.values(organizedContacts).flat().length === 0 && (
              <div className="space-y-2">
                {filteredContacts.map(contact => (
                  <div
                    key={contact.id}
                    className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedContactId === contact.id
                        ? 'bg-[#0088cc] bg-opacity-20 border-l-4 border-[#0088cc]'
                        : 'hover:bg-neutral-800 border-l-4 border-transparent'
                    }`}
                    onClick={() => onContactSelect(contact)}
                  >
                    <div className="relative ml-2">
                      {contact.avatar ? (
                        <img
                          src={contact.avatar}
                          alt={contact.name}
                          className={`w-12 h-12 rounded-full object-cover transition-all duration-200 ${
                            selectedContactId === contact.id ? 'ring-2 ring-[#0088cc]' : ''
                          }`}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=0088cc&color=fff`;
                          }}
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                          selectedContactId === contact.id
                            ? 'bg-[#0088cc]'
                            : 'bg-gray-700 hover:bg-[#0088cc] hover:bg-opacity-70'
                        }`}>
                          {contact.isGroup ? (
                            <FiUsers className="text-white text-lg" />
                          ) : (
                            <span className="text-white text-lg font-medium">
                              {contact.telegramContact?.firstName?.charAt(0) || contact.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      )}

                      {contact.unreadCount > 0 && !contact.isPlaceholder && (
                        <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                          {contact.unreadCount > 9 ? '9+' : contact.unreadCount}
                        </div>
                      )}

                      {contact.isPlaceholder && (
                        <div className="absolute bottom-0 right-0 bg-[#0088cc] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                          <FiPlus />
                        </div>
                      )}
                    </div>

                    <div className="ml-3 flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium truncate text-white">
                          {contact.telegramContact?.firstName || contact.name}
                          {contact.telegramContact?.lastName && ` ${contact.telegramContact.lastName}`}
                          {contact.isPlaceholder && contact.isError && " (Error)"}
                        </h3>
                        {contact.timestamp && (
                          <span className="text-xs text-gray-400">
                            {formatTimestamp(contact.timestamp)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center">
                        {contact.telegramContact?.username && (
                          <span className="text-[#0088cc] text-xs mr-2">@{contact.telegramContact.username}</span>
                        )}
                        <p className="text-sm truncate text-gray-400">
                          {contact.lastMessage ||
                           (contact.isGroup ? `${contact.members} members` :
                            (contact.isPlaceholder ? 'Tap to view messages' : 'No messages yet'))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Refresh button at the bottom */}
      {!loading && filteredContacts.length > 0 && (
        <div className="pt-4 mt-auto">
          <button
            className={`w-full flex items-center justify-center py-2 px-4 rounded-lg transition-all duration-200 ${
              refreshing
                ? 'bg-gray-700 text-gray-400'
                : 'bg-[#0088cc] hover:bg-[#0099dd] text-white shadow-md hover:shadow-lg'
            }`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent border-white mr-2"></div>
                Refreshing...
              </>
            ) : (
              <>
                <FiRefreshCw className="mr-2" />
                Refresh Conversations
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default TelegramContactList;
