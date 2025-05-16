import { useState, useEffect, useRef, useCallback } from 'react';
import { FiSearch, FiRefreshCw, FiMessageCircle, FiUsers, FiPlus, FiSettings } from 'react-icons/fi';
import { FaTelegram } from 'react-icons/fa';
import { useMatrixClient } from '../context/MatrixClientContext';
import { toast } from 'react-hot-toast';
import roomListManager from '../utils/roomListManager';
import logger from '../utils/logger';
import contactOrganizer from '../utils/contactOrganizer';
import ContactCache from '../utils/contactCache';
import PropTypes from 'prop-types';
import '../styles/telegram.css'
import { Virtuoso } from 'react-virtuoso';

/**
 * TelegramContactList Component
 * 
 * NOTE FOR DEVELOPERS: This component has been optimized with:
 * 1. Immediate cached contact rendering
 * 2. Background sync with efficient filters
 * 3. Incremental UI updates
 * 4. Virtualized list rendering
 * 5. Lightweight contact summaries
 */
const TelegramContactList = ({ onContactSelect, selectedContactId }) => {
  const { client, loading: clientLoading } = useMatrixClient() || {};
  const [contacts, setContacts] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [backgroundSyncInProgress, setBackgroundSyncInProgress] = useState(false);
  const [initialCacheLoaded, setInitialCacheLoaded] = useState(false);

  // Organization state
  const [pinnedContactIds, setPinnedContactIds] = useState([]);
  const [mutedContactIds, setMutedContactIds] = useState([]);
  const [archivedContactIds, setArchivedContactIds] = useState([]);
  const [showMuted] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  // Reference for sync timeout
  const syncTimeoutRef = useRef(null);

  // Function to organize contacts into categories
  const organizeContactList = useCallback((contactsToOrganize = contacts) => {
    if (!contactsToOrganize || contactsToOrganize.length === 0) return;

    try {
      // Use the contactOrganizer utility to organize contacts
      contactOrganizer.organizeContacts(contactsToOrganize, {
        pinnedIds: pinnedContactIds,
        mutedIds: mutedContactIds,
        archivedIds: archivedContactIds,
        showMuted,
        showArchived
      });
    } catch (error) {
      logger.error('[TelegramContactList] Error organizing contacts:', error);
    }
  }, [contacts, pinnedContactIds, mutedContactIds, archivedContactIds, showMuted, showArchived]);

  // Reference to track if we've already tried to load contacts
  const hasTriedLoading = useRef(false);

  // ────────────────────────────────────────────────────────────────────────────────
  // STEP 1: Immediately load cached contacts when component mounts
  // ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadCachedContactsImmediately = async () => {
      try {
        logger.info('[TelegramContactList] Immediately loading cached contacts');
        setLoading(true);
        
        // Attempt to get contacts from cache (via ContactCache utility)
        const cachedContacts = await ContactCache.getContacts();
        
        if (cachedContacts && cachedContacts.length > 0) {
          // Filter for Telegram contacts and apply relevance filtering
          const telegramContacts = cachedContacts
            .filter(contact => contact && contact.isTelegram)
            .filter(isRelevantRoom); // Apply relevance filtering to cached contacts too
          
          if (telegramContacts.length > 0) {
            logger.info(`[TelegramContactList] Found ${telegramContacts.length} valid cached contacts, rendering immediately`);
            
            // Update UI with cached contacts
            setContacts(telegramContacts);
            setFilteredContacts(telegramContacts);
            organizeContactList(telegramContacts);
            setInitialCacheLoaded(true);
            
            // Record timestamp for "last updated" indicator
            const lastSyncTimestamp = localStorage.getItem('telegram_contacts_last_sync');
            if (lastSyncTimestamp) {
              setLastSyncTime(new Date(parseInt(lastSyncTimestamp)));
            }
          } else {
            logger.info('[TelegramContactList] No relevant Telegram contacts in cache, will show skeleton loader');
          }
        } else {
          logger.info('[TelegramContactList] No cached contacts found, will show skeleton loader');
        }
      } catch (error) {
        logger.error('[TelegramContactList] Error loading cached contacts:', error);
      } finally {
        // After cached data is loaded (or failed to load), we stop showing the full-screen loader
        // Note: We continue with background sync, but don't block the UI
        setLoading(false);
      }
    };

    loadCachedContactsImmediately();
  }, []);

  // ────────────────────────────────────────────────────────────────────────────────
  // Helper function to sanitize room objects for caching
  // ────────────────────────────────────────────────────────────────────────────────
  const sanitizeRoomForCache = (room) => {
    if (!room) return null;
    
    // Deep clone only the properties we need, removing circular references
    return {
      id: room.id,
      name: room.name || '',
      avatar: typeof room.avatar === 'string' ? room.avatar : null,
      lastMessage: room.lastMessage || '',
      timestamp: room.timestamp || Date.now(),
      unreadCount: room.unreadCount || 0,
      isGroup: Boolean(room.isGroup),
          isTelegram: true,
      members: room.members || 0,
      telegramContact: room.telegramContact ? {
        id: room.telegramContact.id,
        username: room.telegramContact.username,
        firstName: room.telegramContact.firstName,
        lastName: room.telegramContact.lastName,
        avatar: room.telegramContact.avatar
      } : null
    };
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // Helper function to filter irrelevant rooms
  // ────────────────────────────────────────────────────────────────────────────────
  const isRelevantRoom = (room) => {
    if (!room || !room.id) return false;
    
    // Filter out rooms with null, undefined or invalid properties
    if (!room.name) return false;
    
    // Filter out rooms with display names containing specific terms
    const lowerName = room.name.toLowerCase();
    if (lowerName.includes('empty') || 
        lowerName.includes('bot') || 
        lowerName.includes('whatsapp') ||
        lowerName.includes('bridge bot') ||
        lowerName.includes('bridge status') ||
        lowerName.includes('welcome mat')) {
      logger.info(`[TelegramContactList] Filtering out room with unwanted name: ${room.name}`);
      return false;
    }
    
    // Filter out rooms with specific room states
    if (room.roomState === 'leave' || room.roomState === 'ban') {
      logger.info(`[TelegramContactList] Filtering out room with state: ${room.roomState}`);
      return false;
    }
    
    // Filter out rooms with no activity or clearly system rooms
    if (lowerName.match(/^[0-9a-f-]{36}$/) || // UUID-style names
        lowerName.startsWith('!') ||           // Room IDs as names
        lowerName === 'telegram' ||            // Default room name
        lowerName === 'whatsapp') {
      logger.info(`[TelegramContactList] Filtering out system room: ${room.name}`);
      return false;
    }
    
    // Check for telegram-specific criteria to include room
    if (!lowerName.includes('telegram') && 
        !room.isTelegram && 
        !(room.telegramContact && room.telegramContact.id)) {
      logger.info(`[TelegramContactList] Filtering out non-Telegram room: ${room.name}`);
      return false;
    }
    
    return true;
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // STEP 2: Initialize background sync with optimized filters
  // ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Track if the component is mounted
    let isMounted = true;
    
    const initializeBackgroundSync = async () => {
      if (!client || clientLoading) {
        logger.info('[TelegramContactList] Matrix client not available yet, waiting for client');
        return;
      }

      logger.info('[TelegramContactList] Initializing background sync');
      setBackgroundSyncInProgress(true);
      
      try {
        // Initialize room list with optimized filters for Telegram
        roomListManager.initRoomList(
          client.getUserId(),
          client,
          {
            filters: { 
              platform: 'telegram',
              // Apply optimized filter settings
              lazy_load_members: true,
              timeline_limit: 1, // Only need latest message
              include_presence: false,
              exclude_leave: true, // Exclude rooms user has left
              exclude_invite: false // Include rooms user has been invited to
            },
            sortBy: 'lastMessage',
            onMessagesUpdated: handleMessagesUpdated
          },
          handleRoomsUpdated
        );

        // Start syncing rooms in background
        syncRooms();
      } catch (error) {
        logger.error('[TelegramContactList] Error initializing background sync:', error);
      }
    };
    
    // Add listener for matrix client ready state changes
    const handleMatrixClientReadyStateChanged = (event) => {
      if (event.detail && event.detail.ready && isMounted) {
        logger.info('[TelegramContactList] Matrix client ready event received, initializing background sync');
        initializeBackgroundSync();
      }
    };
    
    // Add event listener
    window.addEventListener('matrix-client-ready-state-changed', handleMatrixClientReadyStateChanged);
    
    // Initialize immediately if client already available
    if (client && !clientLoading) {
      initializeBackgroundSync();
    }
    
    // Cleanup on unmount
    return () => {
      isMounted = false;
      window.removeEventListener('matrix-client-ready-state-changed', handleMatrixClientReadyStateChanged);
      
      // Clear any existing sync timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // Clean up room list manager
      if (client) {
        try {
          roomListManager.cleanup(client.getUserId());
          logger.info('[TelegramContactList] Cleaned up room list manager');
        } catch (error) {
          logger.error('[TelegramContactList] Error cleaning up room list manager:', error);
        }
      }
    };
  }, [client, clientLoading]);

  // ────────────────────────────────────────────────────────────────────────────────
  // STEP 3: Sync rooms in background without blocking UI
  // ────────────────────────────────────────────────────────────────────────────────
  const syncRooms = useCallback(async (forceRefresh = false) => {
    if (!client) return;
    
    setBackgroundSyncInProgress(true);
    
    try {
      // Check if Matrix client is in a valid state for syncing
      const syncState = client.getSyncState();
      logger.info(`[TelegramContactList] Matrix client sync state before sync: ${syncState}`);
      
      // If client is in ERROR or STOPPED state, try to recover
      if (syncState === 'ERROR' || syncState === 'STOPPED') {
        await recoverMatrixClient(client, syncState);
      }
      
      // Run room sync in background (don't await here to keep UI responsive)
      const userId = client.getUserId();
      roomListManager.syncRooms(userId, forceRefresh)
        .then(rooms => {
          if (rooms && rooms.length > 0) {
            logger.info(`[TelegramContactList] Background sync completed with ${rooms.length} rooms`);
            
            // Update last sync time
            const now = Date.now();
            setLastSyncTime(new Date(now));
            localStorage.setItem('telegram_contacts_last_sync', now.toString());
          }
        })
        .catch(error => {
          logger.error('[TelegramContactList] Error in background sync:', error);
        })
        .finally(() => {
          setBackgroundSyncInProgress(false);
          
          // Schedule next background sync after 2 minutes
          syncTimeoutRef.current = setTimeout(() => {
            syncRooms(false);
          }, 120000); // 2 minutes
        });
    } catch (error) {
      logger.error('[TelegramContactList] Error setting up background sync:', error);
      setBackgroundSyncInProgress(false);
    }
  }, [client]);

  // Helper function to recover Matrix client from error states
  const recoverMatrixClient = async (client, syncState) => {
    logger.warn(`[TelegramContactList] Matrix client in ${syncState} state, attempting to recover`);
    
    try {
      if (syncState === 'STOPPED') {
        // Start the client if stopped
        await client.startClient({
          initialSyncLimit: 10,
          includeArchivedRooms: true,
          lazyLoadMembers: true
        });
        logger.info('[TelegramContactList] Started Matrix client after STOPPED state');
      } else if (syncState === 'ERROR') {
        // Try to force a retry
        if (client.retryImmediately) {
          client.retryImmediately();
          logger.info('[TelegramContactList] Forced immediate retry after ERROR state');
        }
      }
      
      // Wait for sync to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error('[TelegramContactList] Error recovering Matrix client:', error);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────────
  // STEP 4: Handle incremental updates to the contact list
  // ────────────────────────────────────────────────────────────────────────────────
  // Handle rooms updated event for incremental UI updates
  const handleRoomsUpdated = useCallback((rooms) => {
    if (!rooms || rooms.length === 0) return;
    
    // Filter out invalid and irrelevant rooms before processing
    const validRooms = rooms.filter(room => {
      if (!room || !room.id) {
        logger.warn('[TelegramContactList] Skipping invalid room in handleRoomsUpdated (missing ID)');
        return false;
      }
      
      // Apply our relevance filter
      if (!isRelevantRoom(room)) {
        logger.info(`[TelegramContactList] Filtering out irrelevant room: ${room.name || room.id}`);
        return false;
      }
      
      return true;
    });
    
    logger.info(`[TelegramContactList] Processing ${validRooms.length} valid rooms out of ${rooms.length} total rooms`);
    
    if (validRooms.length === 0) return;
    
    // CRITICAL FIX: Merge with existing contacts instead of replacing them
    setContacts(prevContacts => {
      // Create a map of existing contacts by ID for efficient lookup
      const existingContactsMap = new Map(prevContacts.map(contact => 
        contact && contact.id ? [contact.id, contact] : null).filter(Boolean));
      
      // Add new or updated rooms to the map, preserving existing ones
      validRooms.forEach(room => {
        // Sanitize the room for safe caching
        const sanitizedRoom = sanitizeRoomForCache(room);
        if (sanitizedRoom) {
          existingContactsMap.set(sanitizedRoom.id, sanitizedRoom);
        }
      });
      
      // Convert map back to array and sort by timestamp
      const mergedContacts = Array.from(existingContactsMap.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      try {
        // Cache the sanitized contacts safely
        if (mergedContacts.length > 0) {
          // Create a safe version for caching to avoid DataCloneError
          const cacheSafeContacts = mergedContacts.map(contact => sanitizeRoomForCache(contact));
          ContactCache.cacheContacts(cacheSafeContacts);
        }
      } catch (error) {
        logger.error('[TelegramContactList] Error caching contacts:', error);
      }
      
      return mergedContacts;
    });
    
    // Loading is complete after first update
    setLoading(false);
  }, []);

  // Handle messages updated event (for real-time updates)
  const handleMessagesUpdated = useCallback((roomId, messages) => {
    if (!roomId || !messages || messages.length === 0) return;
    
    // Update the specific contact with new message info
    setContacts(prevContacts => {
      const updatedContacts = [...prevContacts];
      const contactIndex = updatedContacts.findIndex(contact => contact && contact.id === roomId);

      if (contactIndex >= 0) {
          // Get the latest message
          const latestMessage = messages[messages.length - 1];

        // Format message content based on type
          let formattedContent = latestMessage.content;

        // Format different message types
          if (latestMessage.type === 'image') {
            formattedContent = '📷 Image';
          } else if (latestMessage.type === 'video') {
            formattedContent = '🎥 Video';
          } else if (latestMessage.type === 'audio') {
            formattedContent = '🔊 Audio message';
          } else if (latestMessage.type === 'file') {
            formattedContent = '📎 File';
          } else if (latestMessage.type === 'sticker') {
            formattedContent = '🏷️ Sticker';
          }

        // Add sender name for group chats
          if (updatedContacts[contactIndex].isGroup && !latestMessage.isFromMe) {
            let senderName = '';

            if (latestMessage.senderName) {
            // Clean up sender name
              if (latestMessage.senderName.includes('@telegram_')) {
                senderName = 'User';
              } else {
                senderName = latestMessage.senderName.split(' ')[0];
              }
            }

            if (senderName) {
              formattedContent = `${senderName}: ${formattedContent}`;
            }
          }

        // Update the contact with new message info
          updatedContacts[contactIndex] = {
            ...updatedContacts[contactIndex],
            lastMessage: formattedContent,
            timestamp: latestMessage.timestamp
          };
        
        // Create a contact summary for updating the cache
        const contactSummary = sanitizeRoomForCache({
          id: updatedContacts[contactIndex].id,
          name: updatedContacts[contactIndex].name,
          avatar: updatedContacts[contactIndex].avatar,
          lastMessage: formattedContent,
          timestamp: latestMessage.timestamp,
          unreadCount: updatedContacts[contactIndex].unreadCount,
          isGroup: updatedContacts[contactIndex].isGroup,
          isTelegram: true,
          telegramContact: updatedContacts[contactIndex].telegramContact
        });
        
        // Update the contact in cache
        if (contactSummary) {
          ContactCache.updateContact(roomId, contactSummary);
      }

      // Re-sort contacts by timestamp
        return updatedContacts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }
      
      return prevContacts;
    });
  }, []);

  // Filter contacts when search query changes
  useEffect(() => {
    // Apply both null filtering and relevance filtering
    const validContacts = contacts
      .filter(contact => contact != null)
      .filter(isRelevantRoom); // Ensure we only show relevant rooms

    if (searchQuery.trim() === '') {
      setFilteredContacts(validContacts);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = validContacts.filter(contact =>
        contact.name?.toLowerCase().includes(query)
      );
      setFilteredContacts(filtered);
    }
    
    // Organize contacts after filtering
    organizeContactList(validContacts);
  }, [searchQuery, contacts, organizeContactList]);

  // Handle manual refresh
  const handleRefresh = async () => {
    if (refreshing) {
      toast.loading('Already refreshing conversations...', { id: 'refresh-toast' });
      return;
    }

    setRefreshing(true);
    toast.loading('Refreshing conversations...', { id: 'refresh-toast' });

    try {
      // Force a background sync
      await syncRooms(true);
      toast.success('Conversations refreshed!', { id: 'refresh-toast' });
    } catch (error) {
      logger.error('[TelegramContactList] Error refreshing contacts:', error);
      toast.error('Error refreshing conversations', { id: 'refresh-toast' });
    } finally {
      // Add a small delay for better UX
      setTimeout(() => {
        setRefreshing(false);
        toast.dismiss('refresh-toast');
      }, 500);
    }
  };

  // Format timestamp for display
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

  // Render contact item for virtualized list
  const renderContactItem = (index, contact) => {
    // Safety check for null contacts
    if (!contact) return null;
    
    return (
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
                        </h3>
                          <span className="text-xs text-gray-400">
                            {formatTimestamp(contact.timestamp)}
                          </span>
                      </div>

                      <div className="flex items-center">
                        {contact.telegramContact?.username && (
                          <span className="text-[#0088cc] text-xs mr-2">@{contact.telegramContact.username}</span>
                        )}
                        <p className="text-sm truncate text-gray-400">
                          {contact.lastMessage ||
                           (contact.isGroup ? `${contact.members} members` :
                            (contact.isPlaceholder ? 'Tap to view messages' :
                             (contact.room ? 'Loading messages...' : 'Tap to view conversation')))}
                        </p>
                      </div>
                    </div>
                  </div>
    );
  };

  // Render skeleton loader for initial loading
  const renderSkeletonLoader = () => {
    return (
      <div className="space-y-4 p-4">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="flex items-center animate-pulse">
            <div className="w-12 h-12 rounded-full bg-neutral-800 flex-shrink-0"></div>
            <div className="ml-3 flex-1">
              <div className="h-4 bg-neutral-800 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-neutral-800 rounded w-1/2"></div>
              </div>
          </div>
        ))}
        </div>
    );
  };

  // Main render
  return (
    <div className="contact-list-container telegram-contact-list p-6 h-full flex flex-col">
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

      {/* Background sync indicator */}
      {backgroundSyncInProgress && (
        <div className="bg-blue-500 bg-opacity-10 text-blue-400 text-sm px-3 py-1 rounded-md mb-2 flex items-center justify-center">
          <FiRefreshCw className="w-3 h-3 mr-2 animate-spin" />
          Syncing in background...
        </div>
      )}

      {/* Last sync time indicator */}
      {lastSyncTime && !loading && (
        <div className="text-xs text-gray-500 mb-2 text-center">
          Last updated: {formatTimestamp(lastSyncTime)} 
          <button 
            onClick={handleRefresh} 
            className="text-blue-400 ml-1 hover:underline"
          >
            Refresh
            </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────────
         STEP 5: Virtualize contact list for efficient rendering
         ──────────────────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {loading && !initialCacheLoaded ? (
          // Show skeleton loader during initial loading
          renderSkeletonLoader()
        ) : filteredContacts.length === 0 ? (
          // Show empty state
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
          // Render virtualized contact list
          <Virtuoso
            style={{ height: '100%', width: '100%' }}
            totalCount={filteredContacts.length}
            itemContent={(index) => renderContactItem(index, filteredContacts[index])}
            overscan={200}
            className="contacts-virtuoso-list"
          />
        )}
      </div>

      {/* Refresh button at the bottom */}
      {!loading && filteredContacts && filteredContacts.length > 0 && (
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
                  <span>Refreshing...</span>
                </>
              ) : (
                <>
                  <FiRefreshCw className="mr-2" />
                  <span>Refresh Conversations</span>
                </>
              )}
            </button>
        </div>
      )}
    </div>
  );
};

// Add prop validation
TelegramContactList.propTypes = {
  onContactSelect: PropTypes.func.isRequired,
  selectedContactId: PropTypes.string
};

export default TelegramContactList;
