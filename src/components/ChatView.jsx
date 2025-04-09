import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { FiVideo, FiPhone, FiSearch, FiFile, FiWifi, FiWifiOff, FiMoreVertical, FiX, FiFileText } from 'react-icons/fi';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import logger from '../utils/logger';
import { MessageBatchProcessor } from '../utils/MessageBatchProcessor';
import { debounce } from 'lodash';
import { ErrorBoundary } from 'react-error-boundary';
import { useSocket } from '../hooks/useSocket';
import LoadingSpinner from './LoadingSpinner';
import MessageItem from './MessageItem';
import { messageService } from '../services/messageService';
import {
  fetchMessages,
  sendMessage,
  markMessagesAsRead,
  clearMessages,
  addToMessageQueue,
  updateMessageStatus,
  selectMessages,
  selectMessageLoading,
  selectMessageError,
  selectHasMoreMessages,
  selectCurrentPage,
  selectMessageQueue,
  selectUnreadMessageIds,
  fetchNewMessages,
  selectNewMessagesFetching,
  selectLastKnownMessageId,
  selectNewMessagesError,
  refreshMessages,
  selectRefreshing
} from '../store/slices/messageSlice';
import { updateContactMembership, updateContactPriority } from '../store/slices/contactSlice';
import { WiCloudRefresh } from "react-icons/wi";
import { RiAiGenerate } from "react-icons/ri";
import { IoArrowBack } from "react-icons/io5";
import Chatbot from './Chatbot';
import { motion } from 'framer-motion';
import DFSpin from '../images/DF.png';
import ContactAvatar from './ContactAvatar';

// Import environment variables
const API_URL = import.meta.env.VITE_API_URL;

const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Connection lost. Retrying...',
  AUTH_ERROR: 'Authentication failed. Please try logging in again.',
  RATE_LIMIT: 'Too many requests. Waiting before retry...',
  VALIDATION_ERROR: 'Invalid data received. Please refresh the page.',
  SYNC_ERROR: 'Error syncing messages. Retrying...',
  UNKNOWN_ERROR: 'An unexpected error occurred. Retrying...'
};

// Update sync states to match database constraints
const SYNC_STATES = {
  IDLE: 'idle',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const SYNC_STATUS_MESSAGES = {
  [SYNC_STATES.PENDING]: 'Waiting for sync approval...',
  [SYNC_STATES.APPROVED]: 'Sync in progress...',
  [SYNC_STATES.REJECTED]: 'Sync request rejected'
};

const INITIAL_SYNC_STATE = {
  state: SYNC_STATES.PENDING,
  progress: 0,
  details: SYNC_STATUS_MESSAGES[SYNC_STATES.PENDING],
  processedMessages: 0,
  totalMessages: 0,
  errors: []
};

// Array of fun facts for the loading state
const SOCIAL_MEDIA_FUN_FACTS = [
  "WhatsApp processes over 65 billion messages daily.",
  "The average person spends over 2 hours on social media every day.",
  "Facebook was originally called 'TheFacebook' when it launched in 2004.",
  "Instagram was purchased by Facebook for $1 billion in 2012.",
  "Twitter's (X's infact) original name was 'twttr' - vowels were added later.",
  "The first YouTube video was uploaded on April 23, 2005, titled 'Me at the zoo'.",
  "LinkedIn was founded in 2002, making it one of the oldest social networks.",
  "Over 500 hours of video are uploaded to YouTube every minute.",
  "WhatsApp was acquired by Facebook for $19 billion in 2014.",
  "TikTok reached 1 billion users faster than any other platform.",
  "The average time spent reading a tweet is just 1.5 seconds.",
  "Instagram's most-liked photo was of an egg, with over 55 million likes.",
  "The 'Stories' format was originally created by Snapchat before being adopted by other platforms.",
  "Discord was originally created for gamers but expanded to other communities.",
  "The first hashtag on Twitter was used in 2007."
];

// Spinning logo animation variants
const spinVariants = {
  animate: {
    rotate: 360,
    transition: {
      repeat: Infinity,
      duration: 1.5,
      ease: "linear"
    }
  }
};

const SyncProgressIndicator = ({ syncState, loadingState }) => {
  const getStatusColor = () => {
    if (syncState.state === SYNC_STATES.REJECTED) {
        return 'bg-red-500';
    } else if (syncState.state === SYNC_STATES.APPROVED) {
      return 'bg-green-500';
    } else {
        return 'bg-yellow-500';
    }
  };

  // Hide the indicator if loading is complete or sync is complete
  if (loadingState === LOADING_STATES.COMPLETE || 
      (syncState.state === SYNC_STATES.APPROVED && syncState.progress === 100)) {
    return null;
  }

  // Show appropriate loading message based on state
  const getMessage = () => {
    switch (loadingState) {
      case LOADING_STATES.CONNECTING:
        return 'Connecting to chat room...';
      case LOADING_STATES.FETCHING:
        return 'Getting your messages...';
      default:
        return syncState.details;
    }
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-10">
      <div className="flex flex-col space-y-2 p-4 bg-[#24283b] rounded-lg shadow-lg m-4">
        <div className="flex justify-between text-sm text-gray-400">
          <span>{getMessage()}</span>
          {syncState.state === SYNC_STATES.APPROVED && (
            <span>{syncState.processedMessages} / {syncState.totalMessages} messages</span>
          )}
        </div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ease-out ${getStatusColor()}`}
            style={{ 
              width: `${syncState.progress}%`,
              transition: 'width 0.3s ease-out'
            }}
          />
        </div>
        {syncState.state === SYNC_STATES.REJECTED && syncState.errors.length > 0 && (
          <div className="text-xs text-red-400 mt-1">
            {syncState.errors[syncState.errors.length - 1].message}
          </div>
        )}
      </div>
    </div>
  );
};

const handleSyncError = (error, contactId) => {
  const errorMessage = error?.response?.data?.message || error?.message || 'An unknown error occurred';
  
  setSyncState(prev => ({
    ...prev,
    state: SYNC_STATES.REJECTED,
    errors: [...prev.errors, {
      message: errorMessage,
      timestamp: Date.now()
    }]
  }));

  setError(`Message sync failed: ${errorMessage}`);
  
  console.error('[ChatView] Sync error:', {
    contactId,
    error: errorMessage,
    timestamp: new Date().toISOString()
  });
};

const ErrorFallback = ({ error }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <div className="text-red-500 mb-4">Error loading chat</div>
      <div className="text-sm text-gray-600">{error.message}</div>
    </div>
  );
};

// Constants at the top
const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting'
};

// Add new loading state constant
const LOADING_STATES = {
  IDLE: 'idle',
  INITIAL: 'initial',
  CONNECTING: 'connecting',
  FETCHING: 'fetching',
  COMPLETE: 'complete',
  ERROR: 'error'
};

const LoadingChatView = ({ details }) => {
  // Select a random fun fact
  const randomFact = SOCIAL_MEDIA_FUN_FACTS[Math.floor(Math.random() * SOCIAL_MEDIA_FUN_FACTS.length)];
  
  return (
    <div className="flex flex-col h-full bg-[#ECE5DD]">
      {/* Header Skeleton */}
      <div className="flex items-center p-3 bg-[#075E54] border-b border-[#25D366]">
        <div className="w-10 h-10 rounded-full bg-[#757575] animate-pulse"></div>
        <div className="ml-3 flex-1">
          <div className="h-4 w-32 bg-[#757575] rounded animate-pulse"></div>
          <div className="h-3 w-24 bg-[#757575] rounded mt-1 animate-pulse"></div>
        </div>
      </div>
      {/* Messages Area Skeleton */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        <div className="flex justify-start">
          <div className="w-2/3 h-12 bg-[#E0FFEE] rounded-lg animate-pulse"></div>
        </div>
        <div className="flex justify-end">
          <div className="w-2/3 h-10 bg-[#25D366] rounded-lg animate-pulse"></div>
        </div>
        <div className="flex justify-start">
          <div className="w-1/2 h-11 bg-[#E0FFEE] rounded-lg animate-pulse"></div>
        </div>
      </div>
      {/* Loading Indicator with Fun Fact */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="flex flex-col items-center max-w-md px-6 py-4 bg-neutral-800 rounded-lg">
          <motion.img 
            src={DFSpin} 
            className="w-12 h-12 mb-3"
            variants={spinVariants}
            animate="animate"
            alt="Loading..."
          />
          <p className="text-white font-medium text-center mb-1">Connecting to chat...</p>
          <p className="text-sm text-gray-300 mb-2">{details}</p>
          <p className="text-xs text-gray-400 italic text-center mt-2 max-w-[300px]">
            {randomFact}
          </p>
        </div>
      </div>
    </div>
  );
};

const ChatView = ({ selectedContact, onContactUpdate }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.auth.session?.user);
  const { socket, isConnected } = useSocketConnection('whatsapp');
  const isRefreshing = useSelector(selectRefreshing);

  // Redux message selectors
  const messagesState = useSelector((state) => state.messages);
  const messages = useSelector((state) => selectMessages(state, selectedContact?.id) || []);
  const loading = useSelector((state) => selectMessageLoading(state) || false);
  const error = useSelector((state) => selectMessageError(state) || null);
  const hasMoreMessages = useSelector((state) => selectHasMoreMessages(state) || false);
  const currentPage = useSelector((state) => selectCurrentPage(state) || 0);
  const messageQueue = useSelector((state) => selectMessageQueue(state) || []);
  const unreadMessageIds = useSelector((state) => selectUnreadMessageIds(state) || []);
  const isNewMessagesFetching = useSelector(selectNewMessagesFetching);
  const lastKnownMessageId = useSelector((state) => selectLastKnownMessageId(state, selectedContact?.id));
  const newMessagesError = useSelector(selectNewMessagesError);

  // Local state
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [priorityRetries, setPriorityRetries] = useState(0);
  const [socketState, setSocketState] = useState({
    isConnecting: false,
    retries: 0,
    lastError: null,
  });
  const [previewMedia, setPreviewMedia] = useState(null);
  const [priority, setPriority] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [initializingPriority, setInitializingPriority] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [loadingState, setLoadingState] = useState(LOADING_STATES.IDLE);
  const [syncState, setSyncState] = useState({
    state: SYNC_STATES.IDLE,
    progress: 0,
    details: '',
    processedMessages: 0,
    totalMessages: 0,
  });

  // Refs
  const syncAbortController = useRef(null);
  const lastSyncRequest = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messageCache = useRef(new Map());
  const isMounted = useRef(true);
  const batchProcessorRef = useRef(null);
  const offlineTimeoutRef = useRef(null);
  const lastSyncRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  // Constants
  const PAGE_SIZE = 50;
  const MAX_RETRIES = 3;
  const RETRY_COOLDOWN = 5000;

  // Callbacks
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleMessageSend = useCallback(
    async (content) => {
      if (!selectedContact?.id) return;

      const message = { content };

      if (!socketReady) {
        dispatch(addToMessageQueue(message));
        toast.success('Message queued for delivery');
        return;
      }

      try {
        await dispatch(sendMessage({ contactId: selectedContact.id, message })).unwrap();
        scrollToBottom();
      } catch (error) {
        logger.error('[ChatView] Error sending message:', error);
        dispatch(addToMessageQueue(message));
        toast.error('Failed to send message, queued for retry');
      }
    },
    [dispatch, selectedContact?.id, socketReady, scrollToBottom]
  );

  const handleMarkAsRead = useCallback(
    debounce((messageIds) => {
      if (!selectedContact?.id || messageIds.length === 0 || !isMounted.current) return;
      dispatch(markMessagesAsRead({ contactId: selectedContact.id, messageIds }));
    }, 1000),
    [dispatch, selectedContact?.id]
  );

  const handleSummaryClick = async () => {
    if (!selectedContact?.id) {
      toast.error('No contact selected for summary');
      return;
    }

    if (messages.length === 0) {
      toast.error('No messages available to summarize');
      return;
    }

    try {
      setIsSummarizing(true);
      logger.info('[ChatView] Fetching summary for contact:', {
        contactId: selectedContact.id,
        messageCount: messages.length,
      });

      const response = await api.get(`/api/analysis/summary/${selectedContact.id}`);

      if (!response.data?.summary) {
        toast.success('summary: ', response?.data);
        return;
      }

      logger.info('[ChatView] Summary received:', {
        contactId: selectedContact.id,
        summary: response.data,
      });

      setSummaryData(response.data);
      setShowSummaryModal(true);
    } catch (error) {
      logger.error('[ChatView] Error fetching summary:', {
        error,
        contactId: selectedContact.id,
      });
      toast.error('Failed to generate chat summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleFetchNewMessages = async () => {
    if (!selectedContact || isNewMessagesFetching) return;

    try {
      const lastMessage = messages[messages.length - 1];
      const lastEventId = lastMessage?.message_id || lastMessage?.id;

      if (!lastEventId) {
        toast.error('No message history available');
        return;
      }

      const validLastEventId = typeof lastEventId === 'string' ? lastEventId : String(lastEventId);

      const result = await dispatch(
        fetchNewMessages({
          contactId: selectedContact.id,
          lastEventId: validLastEventId,
        })
      ).unwrap();

      if (result?.warning) {
        toast.warn(result.warning);
        return;
      }

      if (result?.messages?.length > 0) {
        scrollToBottom();
        toast.success(`${result.messages.length} new message(s) received`);
      } else {
        toast.info('No new messages');
      }
    } catch (error) {
      logger.error('[ChatView] Error fetching new messages:', error);
      toast.error(error.message || 'Failed to fetch new messages');
    }
  };

  const handleRefresh = async () => {
    if (!selectedContact?.id || isRefreshing) return;

    try {
      await dispatch(refreshMessages({ contactId: selectedContact.id })).unwrap();
      toast.success('Messages refreshed successfully');
    } catch (error) {
      toast.error('Unable to refresh messages');
    }
  };

  // Effects
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedContact?.id) return;

    if (selectedContact?.membership === 'join') {
      setLoadingState(LOADING_STATES.CONNECTING);
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.PENDING,
        progress: 0,
        details: 'Connecting to chat room...',
        processedMessages: 0,
        totalMessages: 0,
      }));

      logger.info('[ChatView] Setting up room listener for contact:', {
        contactId: selectedContact.id,
        membership: selectedContact.membership,
      });

      api.post(`/api/v1/whatsapp/contacts/${selectedContact.id}/listen`)
        .then((response) => {
          logger.info('[ChatView] Room listener setup successful:', {
            contactId: selectedContact.id,
            response: response.data,
          });
        })
        .catch((error) => {
          logger.warn('[ChatView] Room listener setup failed, but continuing with message fetch:', {
            contactId: selectedContact.id,
            error: error.message,
          });
          toast.warn('Real-time updates may be delayed but you can use the "new messages" button for new updates');
        })
        .finally(() => {
          setLoadingState(LOADING_STATES.FETCHING);
          setSyncState((prev) => ({
            ...prev,
            state: SYNC_STATES.APPROVED,
            progress: 50,
            details: 'Getting your messages...',
            processedMessages: 0,
            totalMessages: 0,
          }));

          dispatch(clearMessages());

          dispatch(
            fetchMessages({
              contactId: selectedContact.id,
              page: 0,
              limit: PAGE_SIZE,
            })
          )
            .unwrap()
            .then((result) => {
              setLoadingState(LOADING_STATES.COMPLETE);
              setSyncState((prev) => ({
                ...prev,
                state: SYNC_STATES.APPROVED,
                progress: 100,
                details: 'Messages loaded successfully',
                processedMessages: result.messages.length,
                totalMessages: result.messages.length,
              }));
            })
            .catch((error) => {
              logger.error('[ChatView] Failed to fetch messages:', {
                contactId: selectedContact.id,
                error: error.message,
              });
              setLoadingState(LOADING_STATES.ERROR);
              setSyncState((prev) => ({
                ...prev,
                state: SYNC_STATES.REJECTED,
                progress: 0,
                details: 'Failed to load messages',
                errors: [
                  ...prev.errors,
                  {
                    message: error.message,
                    timestamp: Date.now(),
                  },
                ],
              }));
              toast.error('Failed to load messages');
            });
        });
    }
  }, [dispatch, selectedContact?.id, selectedContact?.membership]);

  useEffect(() => {
    if (selectedContact?.id) {
      setLoadingState(LOADING_STATES.CONNECTING);
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.PENDING,
        progress: 0,
        details: 'Initializing chat...',
        processedMessages: 0,
        totalMessages: 0,
      }));
    } else {
      setLoadingState(LOADING_STATES.IDLE);
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.IDLE,
      }));
    }
  }, [selectedContact?.id]);

  useEffect(() => {
    if (!socket || !selectedContact?.id) return;

    const handleContactUpdate = (data) => {
      if (data.contactId === selectedContact.id) {
        logger.info('[ChatView] Received contact update:', data);
        onContactUpdate(data.contact);
      }
    };

    const handleMembershipUpdate = (data) => {
      if (data.contactId === selectedContact.id) {
        logger.info('[ChatView] Received membership update:', data);
        onContactUpdate({
          ...selectedContact,
          membership: data.membership,
        });
      }
    };

    socket.on('whatsapp:contact:update', handleContactUpdate);
    socket.on('whatsapp:membership:update', handleMembershipUpdate);

    return () => {
      socket.off('whatsapp:contact:update', handleContactUpdate);
      socket.off('whatsapp:membership:update', handleMembershipUpdate);
    };
  }, [socket, selectedContact?.id, onContactUpdate]);

  useEffect(() => {
    if (!socket || !selectedContact?.id || !currentUser?.id) {
      logger.info('[ChatView] Socket or contact not ready:', {
        hasSocket: !!socket,
        socketId: socket?.id,
        contactId: selectedContact?.id,
        userId: currentUser?.id,
        connected: socket?.connected,
      });
      return;
    }

    logger.info('[ChatView] Setting up socket event handlers:', {
      contactId: selectedContact.id,
      socketConnected: socket.connected,
      socketId: socket.id,
      rooms: socket.rooms,
      namespace: socket.nsp,
    });

    const processedMessageIds = new Set();

    const handleNewMessage = (payload) => {
      logger.info('[ChatView] Received socket message:', {
        payload,
        selectedContactId: selectedContact.id,
        matches: payload.contactId === selectedContact.id,
        socketId: socket.id,
        rooms: socket.rooms,
      });

      if (payload.contactId === selectedContact.id) {
        const messageId = payload.message.message_id || payload.message.id;
        const normalized = messageService.normalizeMessage(payload.message);

        const isDuplicate = messages.some(
          (m) =>
            m.id === normalized.id ||
            m.message_id === normalized.message_id ||
            m.content_hash === normalized.content_hash
        );

        if (!isDuplicate && !processedMessageIds.has(normalized.id)) {
          processedMessageIds.add(normalized.id);

          logger.info('[ChatView] Processing new message:', {
            messageId: messageId,
            content: payload.message.content,
            timestamp: payload.message.timestamp,
          });

          dispatch({
            type: 'messages/messageReceived',
            payload: {
              contactId: selectedContact.id,
              message: normalized || payload.message,
            },
          });
          scrollToBottom();
        } else {
          logger.info('[ChatView] Skipping duplicate message:', {
            messageId,
            timestamp: payload.message.timestamp,
          });
        }
      }
    };

    const handleMessageUpdate = (updatedMessage) => {
      if (updatedMessage.contactId === selectedContact.id) {
        logger.info('[ChatView] Message updated:', updatedMessage);
        dispatch(
          updateMessageStatus({
            contactId: selectedContact.id,
            messageId: updatedMessage.id,
            status: updatedMessage.status,
          })
        );
      }
    };

    socket.emit('authenticate', { userId: currentUser.id });

    const userRoom = `user:${currentUser.id}`;
    socket.emit('join:room', userRoom);

    socket.off('whatsapp:message');
    socket.off('whatsapp:message:update');
    socket.off('room:joined');
    socket.off('room:error');

    socket.on('whatsapp:message', handleNewMessage);
    socket.on('whatsapp:message:update', handleMessageUpdate);

    return () => {
      socket.off('whatsapp:message:new', handleNewMessage);
      socket.off('whatsapp:message:update', handleMessageUpdate);
    };
  }, [socket, selectedContact?.id, dispatch, currentPage, scrollToBottom]);

  useEffect(() => {
    if (!socket) {
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
      setSocketReady(false);
      return;
    }

    setConnectionStatus(socket.connected ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.CONNECTING);
    setSocketReady(socket.connected);

    const handleConnect = () => {
      logger.info('[ChatView] Socket connected');
      setConnectionStatus(CONNECTION_STATUS.CONNECTED);
      setSocketReady(true);
    };

    const handleDisconnect = () => {
      logger.info('[ChatView] Socket disconnected');
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
      setSocketReady(false);
    };

    const handleConnecting = () => {
      logger.info('[ChatView] Socket connecting');
      setConnectionStatus(CONNECTION_STATUS.CONNECTING);
      setSocketReady(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connecting', handleConnecting);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connecting', handleConnecting);
    };
  }, [socket]);

  useEffect(() => {
    if (loadingState === LOADING_STATES.FETCHING) {
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.APPROVED,
        details: 'Getting your messages...',
        progress: 50,
      }));
    } else if (loadingState === LOADING_STATES.COMPLETE && messages.length > 0) {
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.APPROVED,
        details: 'Messages loaded successfully',
        progress: 100,
        processedMessages: messages.length,
        totalMessages: messages.length,
      }));
    } else if (loadingState === LOADING_STATES.ERROR) {
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.REJECTED,
        details: error || 'Failed to load messages',
        errors: [
          ...prev.errors,
          { message: error || 'Failed to load messages', timestamp: Date.now() },
        ],
      }));
    }
  }, [loadingState, messages.length, error]);

  useEffect(() => {
    if (selectedContact) {
      setPriority(selectedContact.metadata?.priority || 'medium');
    }
  }, [selectedContact]);

  const handlePriorityChange = (priority) => {
    if (!selectedContact) return;

    setPriority(priority);

    dispatch(updateContactPriority({
      contactId: selectedContact.id,
      priority,
    }));

    if (typeof onContactUpdate === 'function') {
      const updatedContact = {
        ...selectedContact,
        metadata: {
          ...selectedContact.metadata,
          priority,
        },
      };
      onContactUpdate(updatedContact);
    }
  };

  const renderConnectionStatus = useCallback(() => {
    switch (connectionStatus) {
      case CONNECTION_STATUS.CONNECTED:
        return <span className="text-sm text-[#25D366]">online</span>;
      case CONNECTION_STATUS.DISCONNECTED:
        return <span className="text-sm text-[#757575]">offline</span>;
      case CONNECTION_STATUS.CONNECTING:
        return <span className="text-sm text-[#757575]">connecting...</span>;
      default:
        return null;
    }
  }, [connectionStatus]);

  const renderMessages = useCallback(() => {
    if (loadingState === LOADING_STATES.INITIAL || loadingState === LOADING_STATES.CONNECTING) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <LoadingSpinner />
          <p className="mt-2 text-[#757575]">
            {loadingState === LOADING_STATES.INITIAL ? 'Preparing chat...' : 'Connecting to chat...'}
          </p>
        </div>
      );
    }

    if (loadingState === LOADING_STATES.FETCHING) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <LoadingSpinner />
          <p className="mt-2 text-[#757575]">Getting your messages...</p>
        </div>
      );
    }

    if (loadingState === LOADING_STATES.ERROR) {
      return <div className="text-[#757575] bg-neutral-900 text-center">{error || 'Failed to load messages'}</div>;
    }

    if (!messages.length) {
      return <div className="text-[#757575] text-center">No messages yet</div>;
    }

    return messages.map((message) => (
      <MessageItem
        key={`${message.id}_${message.message_id}_${message.timestamp}`}
        message={message}
        currentUser={currentUser}
      />
    ));
  }, [loadingState, messages, error, currentUser]);

  const renderAvatar = () => {
    if (!selectedContact.avatar_url) {
      return (
        <span className="text-[#FFFFFF] text-lg">
          {(selectedContact.display_name || '?')[0].toUpperCase()}
        </span>
      );
    }

    const avatarUrl = selectedContact.avatar_url.startsWith('http')
      ? selectedContact.avatar_url
      : `${import.meta.env.VITE_MATRIX_SERVER_URL}/_matrix/media/v3/download/${selectedContact.avatar_url}`;

    return (
      <img
        src={avatarUrl}
        alt={selectedContact.display_name || 'Contact'}
        className="w-full h-full rounded-full object-cover"
      />
    );
  };

  if (!selectedContact) {
    return (
      <div className="flex-1 flex items-center justify-center mt-[35%] bg-neutral-900 text-[#757575]">
        <p>Select a contact to view the chat</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neutral-900 relative">
      {!selectedContact?.id ? (
        <div className="flex flex-col items-center justify-center h-full text-[#757575] bg-neutral-900">
          <p>Select a contact to view the chat</p>
        </div>
      ) : loadingState === LOADING_STATES.CONNECTING || loadingState === LOADING_STATES.FETCHING ? (
        <LoadingChatView details={syncState.details} />
      ) : (
        <div className="relative flex flex-col h-full">
          <SyncProgressIndicator syncState={syncState} loadingState={loadingState} />

          {/* Header */}
          <div className="px-3 py-2 bg-nutral-900 flex items-center justify-between border-b border-[#25D366] flex-none">
            <div className="flex items-center space-x-3 w-full">
              <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center">
                <ContactAvatar contact={selectedContact} size={40} />
              </div>
              <div>
                <h2 className="text-[#FFFFFF] font-medium text-base">
                  {selectedContact.display_name || 'Unknown Contact'}
                </h2>
                <div className="flex items-center space-x-2">
                  {renderConnectionStatus()}
                  {/* Priority Dropdown (Note A) */}
                  <select
                    value={priority || selectedContact.metadata?.priority || 'medium'}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    className="bg-neutral-900 bg-opacity-70 text-[#FFFFFF] text-sm rounded-md border border-[#25D366] px-2 py-0.5 appearance-none cursor-pointer hover:bg-[#064D45] focus:outline-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23FFFFFF' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 0.5rem center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '1em 1em',
                      paddingRight: '2rem',
                    }}
                  >
                    <option value="low" className="text-[#FFFFFF] bg-[#075E54]">Low</option>
                    <option value="medium" className="text-[#FFFFFF] bg-[#075E54]">Medium</option>
                    <option value="high" className="text-[#FFFFFF] bg-[#075E54]">High</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {connectionStatus !== 'connected' && messageQueue.length > 0 && (
                <div className="text-sm text-[#757575]">
                  {messageQueue.length} message{messageQueue.length > 1 ? 's' : ''} queued
                </div>
              )}
              {/* Refresh Icon (Note B) */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`p-2 text-[#FFFFFF] bg-neutral-900 hover:text-[#25D366] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isRefreshing ? 'animate-glow' : ''}`}
                title="Refresh messages"
              >
                <WiCloudRefresh className="w-6 h-6" />
              </button>
              {/* Summary Icon (Note C) */}
              <button
                onClick={handleSummaryClick}
                disabled={messages.length === 0 || isSummarizing}
                className={`p-2 text-[#FFFFFF] bg-neutral-900 hover:text-[#25D366] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isSummarizing ? 'animate-glow' : ''}`}
                title={messages.length === 0 ? 'No messages to summarize' : 'Generate summary'}
              >
                <RiAiGenerate className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#ECE5DD]"
            onScroll={async (e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.target;
              if (scrollTop === 0 && hasMoreMessages && !loading) {
                const nextPage = currentPage + 1;
                await dispatch(
                  fetchMessages({
                    contactId: selectedContact.id,
                    page: nextPage,
                    limit: PAGE_SIZE,
                  })
                );
              }
            }}
          >
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>

          {/* Summary Modal */}
          {showSummaryModal && summaryData && (
            <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-6">
              <div className="bg-neutral-900 backdrop-blur-lg bg-opacity-60 border border-white/10 rounded-lg p-6 max-w-2xl w-full mx-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-medium text-gray-200 opa">Chat <span className="bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">Summary</span></h3>
                  <button
                    onClick={() => setShowSummaryModal(false)}
                    className="text-[#757575] w-auto rounded-full bg-neutral-900 hover:text-[#FFFFFF]"
                  >
                    <FiX className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-[#FFFFFF] font-medium mb-1">Main Points</h4>
                    <ul className="list-disc list-inside text-[#CCCCCC] space-y-1">
                      {summaryData.summary.mainPoints.map((point, index) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                  </div>
                  {summaryData.summary.actionItems.length > 0 && (
                    <div>
                      <h4 className="text-[#FFFFFF] font-medium mb-1">Action Items</h4>
                      <ul className="list-disc list-inside text-[#CCCCCC] space-y-1">
                        {summaryData.summary.actionItems.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summaryData.summary.keyDecisions.length > 0 && (
                    <div>
                      <h4 className="text-[#FFFFFF] font-medium mb-1">Key Decisions</h4>
                      <ul className="list-disc list-inside text-[#CCCCCC] space-y-1">
                        {summaryData.summary.keyDecisions.map((decision, index) => (
                          <li key={index}>{decision}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="text-sm text-[#757575] pt-2 border-t border-[#25D366]">
                    <p>Analyzed {summaryData.messageCount} messages</p>
                    <p>From: {new Date(summaryData.timespan.start).toLocaleString()}</p>
                    <p>To: {new Date(summaryData.timespan.end).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Add Chatbot component when a contact is selected */}
      {selectedContact?.id && <Chatbot contactId={selectedContact.id} />}
    </div>
  );
};


// Wrap ChatView with ErrorBoundary
export const ChatViewWithErrorBoundary = (props) => (
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <ChatView {...props} />
  </ErrorBoundary>
);

export default ChatViewWithErrorBoundary;

