import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import { contactService } from '../services/contactService';
import { api } from '../services/api';
import { toast } from 'react-hot-toast';
import {
  SYNC_STATES,
  SYNC_MESSAGES,
  RetryManager,
  SyncStateManager,
  SocketEventManager,
  createSyncHandlers
} from '../utils/syncUtils';
import { useSelector } from 'react-redux';
import logger from '../utils/logger';

export function useContactSync() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncState, setSyncState] = useState({
    state: SYNC_STATES.IDLE,
    progress: 0,
    details: SYNC_MESSAGES[SYNC_STATES.IDLE],
    errors: [],
    lastSync: null
  });

  const { socket, isConnected, emit } = useSocket();
  const lastSyncRef = useRef(null);
  const syncTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const timeoutsRef = useRef(new Set());
  const MAX_RETRIES = 3;
  const userId = useSelector(state => state.auth.session?.user?.id);
  
  // Initialize managers
  const retryManager = useRef(new RetryManager()).current;
  const syncStateManager = useRef(
    new SyncStateManager(newState => setSyncState(newState))
  ).current;
  const socketManager = useRef(null);

  // Add state history tracking
  const stateHistoryRef = useRef([]);
  const operationTimeoutsRef = useRef(new Map());

  // Add progress handling utilities
  const PROGRESS_UPDATE_INTERVAL = 100; // Throttle to 100ms
  const SIGNIFICANT_PROGRESS_CHANGE = 5; // 5% change is significant

  // Progress update queue
  const progressQueueRef = useRef([]);
  const lastProgressUpdateRef = useRef(Date.now());

  // Enhanced state transitions with reset paths
  const STATE_TRANSITIONS = {
    [SYNC_STATES.IDLE]: [SYNC_STATES.SYNCING],
    [SYNC_STATES.SYNCING]: [SYNC_STATES.APPROVED, SYNC_STATES.REJECTED, SYNC_STATES.ERROR],
    [SYNC_STATES.APPROVED]: [SYNC_STATES.SYNCING, SYNC_STATES.IDLE],
    [SYNC_STATES.REJECTED]: [SYNC_STATES.SYNCING, SYNC_STATES.IDLE],
    [SYNC_STATES.ERROR]: [SYNC_STATES.SYNCING, SYNC_STATES.IDLE]
  };

  // Add state duration tracking
  const STATE_DURATION_LIMITS = {
    [SYNC_STATES.SYNCING]: 5 * 60 * 1000, // 5 minutes
    [SYNC_STATES.ERROR]: 30 * 60 * 1000   // 30 minutes
  };

  // Validate state transitions
  const isValidStateTransition = useCallback((fromState, toState) => {
    const allowedTransitions = STATE_TRANSITIONS[fromState];
    return allowedTransitions?.includes(toState) ?? false;
  }, []);

  // Enhanced progress validation and update
  const updateProgress = useCallback((newProgress, details) => {
    const now = Date.now();
    
    // Queue progress update
    progressQueueRef.current.push({
      progress: newProgress,
      details,
      timestamp: now
    });

    // Process queue if enough time has passed
    if (now - lastProgressUpdateRef.current >= PROGRESS_UPDATE_INTERVAL) {
      processProgressQueue();
    }
  }, []);

  // Process queued progress updates
  const processProgressQueue = useCallback(() => {
    if (progressQueueRef.current.length === 0) return;

    setSyncState(prev => {
      const updates = progressQueueRef.current;
      progressQueueRef.current = [];
      lastProgressUpdateRef.current = Date.now();

      // Calculate aggregate progress
      const avgProgress = Math.round(
        updates.reduce((sum, update) => sum + update.progress, 0) / updates.length
      );

      // Validate progress value
      if (typeof avgProgress !== 'number' || avgProgress < 0 || avgProgress > 100) {
        logger.warn('[useContactSync] Invalid aggregate progress:', {
          updates,
          avgProgress
        });
        return prev;
      }

      // Check for significant change
      const progressDiff = Math.abs(avgProgress - prev.progress);
      if (progressDiff < SIGNIFICANT_PROGRESS_CHANGE && avgProgress !== 100) {
        return prev; // Skip insignificant updates
      }

      // Prevent progress regression unless explicitly allowed
      if (avgProgress < prev.progress && !updates.some(u => u.details?.allowRegression)) {
        logger.warn('[useContactSync] Progress regression prevented:', {
          current: prev.progress,
          attempted: avgProgress,
          updates
        });
        return prev;
      }

      // Get latest details
      const latestUpdate = updates[updates.length - 1];
      
      // Track progress velocity
      const progressVelocity = progressDiff / 
        (latestUpdate.timestamp - prev.lastUpdated || 1) * 1000; // progress per second

      // Detect suspicious progress jumps
      if (progressDiff > 20) {
        logger.warn('[useContactSync] Large progress jump detected:', {
          from: prev.progress,
          to: avgProgress,
          jump: progressDiff,
          velocity: progressVelocity,
          updates
        });
      }

      // Estimate time remaining
      const remainingProgress = 100 - avgProgress;
      const estimatedTimeRemaining = progressVelocity > 0 
        ? Math.round(remainingProgress / progressVelocity * 1000) 
        : null;

      return {
        ...prev,
        progress: avgProgress,
        details: latestUpdate.details || prev.details,
        lastUpdated: Date.now(),
        progressMetadata: {
          velocity: progressVelocity,
          estimatedTimeRemaining,
          updateCount: updates.length,
          lastBatch: updates
        }
      };
    });
  }, []);

  // Enhanced timeout management
  const setOperationTimeout = useCallback((operationId, callback, delay) => {
    const timeoutId = setTimeout(() => {
      operationTimeoutsRef.current.delete(operationId);
      callback();
    }, delay);

    operationTimeoutsRef.current.set(operationId, {
      id: timeoutId,
      operationId,
      startTime: Date.now(),
      delay
    });

    return timeoutId;
  }, []);

  const clearOperationTimeouts = useCallback((operationId) => {
    if (operationId) {
      const timeout = operationTimeoutsRef.current.get(operationId);
      if (timeout) {
        clearTimeout(timeout.id);
        operationTimeoutsRef.current.delete(operationId);
      }
    } else {
      // Clear all timeouts
      operationTimeoutsRef.current.forEach(timeout => clearTimeout(timeout.id));
      operationTimeoutsRef.current.clear();
    }
  }, []);

  // Enhanced state management
  const updateSyncState = useCallback((newState, data = {}) => {
    setSyncState(prev => {
      // Validate state transition
      if (!isValidStateTransition(prev.state, newState)) {
        logger.warn('[useContactSync] Invalid state transition:', {
          from: prev.state,
          to: newState,
          data
        });
        return prev;
      }

      // Check state duration limits
      const currentDuration = Date.now() - prev.lastUpdated;
      const durationLimit = STATE_DURATION_LIMITS[prev.state];
      if (durationLimit && currentDuration > durationLimit) {
        logger.warn('[useContactSync] State duration exceeded limit:', {
          state: prev.state,
          duration: currentDuration,
          limit: durationLimit
        });
        // Force transition to ERROR if stuck in SYNCING
        if (prev.state === SYNC_STATES.SYNCING) {
          newState = SYNC_STATES.ERROR;
          data.error = 'Sync operation timed out';
        }
      }

      // Create new state with enhanced context
      const nextState = {
        ...prev,
        state: newState,
        error: data.error || null,
        details: data.details || prev.details,
        lastSync: data.timestamp || prev.lastSync,
        lastUpdated: Date.now(),
        context: {
          ...data.context,
          operationType: data.operationType || 'unknown',
          triggeredBy: data.triggeredBy || 'system',
          attempt: (prev.context?.attempt || 0) + 1
        }
      };

      // Add to history with enhanced metadata
      stateHistoryRef.current.push({
        ...nextState,
        timestamp: Date.now(),
        metadata: {
          operationId: data.operationId,
          previousState: prev.state,
          transitionTrigger: data.trigger || 'internal',
          socketConnected: isConnected
        }
      });

      // Keep last 20 states for better debugging context
      if (stateHistoryRef.current.length > 20) {
        stateHistoryRef.current.shift();
      }

      // Emit state change event for external subscribers
      emit('sync:stateChanged', {
        from: prev.state,
        to: newState,
        context: nextState.context
      });

      return nextState;
    });
  }, [isValidStateTransition, isConnected, emit]);

  // Add progress monitoring
  useEffect(() => {
    // Process queued updates periodically
    const progressInterval = setInterval(() => {
      if (progressQueueRef.current.length > 0) {
        processProgressQueue();
      }
    }, PROGRESS_UPDATE_INTERVAL);

    // Monitor for stalled progress
    const stallCheckInterval = setInterval(() => {
      setSyncState(current => {
        if (current.state === SYNC_STATES.SYNCING) {
          const timeSinceUpdate = Date.now() - current.lastUpdated;
          if (timeSinceUpdate > 10000 && current.progress < 100) { // 10 seconds
            logger.warn('[useContactSync] Progress stalled:', {
              progress: current.progress,
              timeSinceUpdate,
              state: current.state
            });
            
            // Emit stall warning
            emit('sync:progressStalled', {
              progress: current.progress,
              duration: timeSinceUpdate
            });
          }
        }
        return current;
      });
    }, 5000); // Check every 5 seconds

    return () => {
      clearInterval(progressInterval);
      clearInterval(stallCheckInterval);
      progressQueueRef.current = [];
    };
  }, [processProgressQueue, emit]);

  // Add state monitoring
  useEffect(() => {
    const stateMonitorInterval = setInterval(() => {
      setSyncState(current => {
        const duration = Date.now() - current.lastUpdated;
        const limit = STATE_DURATION_LIMITS[current.state];
        
        if (limit && duration > limit) {
          logger.warn('[useContactSync] State duration check failed:', {
            state: current.state,
            duration,
            limit
          });
          
          if (current.state === SYNC_STATES.SYNCING) {
            return {
              ...current,
              state: SYNC_STATES.ERROR,
              error: 'Operation timed out',
              details: 'Sync operation exceeded time limit',
              lastUpdated: Date.now()
            };
          }
        }
        return current;
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(stateMonitorInterval);
  }, []);

  // Enhanced error handling constants and types
  const ERROR_CATEGORIES = {
    NETWORK: {
      type: 'NETWORK',
      retryable: true,
      maxRetries: 5,
      baseDelay: 1000
    },
    RATE_LIMIT: {
      type: 'RATE_LIMIT',
      retryable: true,
      maxRetries: 3,
      baseDelay: 5000
    },
    AUTH: {
      type: 'AUTH',
      retryable: false,
      requiresUserAction: true
    },
    VALIDATION: {
      type: 'VALIDATION',
      retryable: false,
      requiresUserAction: true
    },
    TIMEOUT: {
      type: 'TIMEOUT',
      retryable: true,
      maxRetries: 3,
      baseDelay: 2000
    },
    INTERNAL: {
      type: 'INTERNAL',
      retryable: true,
      maxRetries: 2,
      baseDelay: 2000
    }
  };

  // Error tracking ref
  const errorHistoryRef = useRef([]);
  const MAX_ERROR_HISTORY = 50;

  // Enhanced error handling
  const handleSyncError = useCallback((data) => {
    const errorMessage = data?.error || 'Unknown error occurred';
    const errorType = data?.errorType || 'UNKNOWN';
    const operationId = data?.operationId;
    const errorCategory = ERROR_CATEGORIES[errorType] || ERROR_CATEGORIES.INTERNAL;
    
    // Clear operation-specific timeouts
    clearOperationTimeouts(operationId);

    // Create error entry
    const errorEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message: errorMessage,
      type: errorType,
      category: errorCategory,
      timestamp: Date.now(),
      operationId,
      context: {
        state: syncState.state,
        progress: syncState.progress,
        socketConnected: isConnected,
        retryCount: retryCountRef.current
      },
      stack: data?.stack,
      correlationId: data?.correlationId
    };

    // Add to error history
    errorHistoryRef.current.push(errorEntry);
    if (errorHistoryRef.current.length > MAX_ERROR_HISTORY) {
      errorHistoryRef.current.shift();
    }

    // Check for error patterns
    const recentErrors = errorHistoryRef.current
      .filter(e => Date.now() - e.timestamp < 5 * 60 * 1000); // Last 5 minutes

    const similarErrors = recentErrors
      .filter(e => e.type === errorType)
      .length;

    // Update state with error
    updateSyncState(SYNC_STATES.ERROR, {
      error: errorMessage,
      details: `Sync failed: ${errorMessage}`,
      errorType,
      errorMetadata: {
        category: errorCategory,
        similarErrorsCount: similarErrors,
        errorId: errorEntry.id
      },
      timestamp: Date.now()
    });

    // Handle retries based on error category
    if (errorCategory.retryable && retryCountRef.current < errorCategory.maxRetries) {
      retryCountRef.current++;
      
      // Calculate retry delay with jitter
      const baseDelay = errorCategory.baseDelay;
      const maxJitter = Math.min(baseDelay * 0.1, 1000); // 10% jitter up to 1s
      const jitter = Math.random() * maxJitter;
      const retryDelay = Math.min(
        baseDelay * Math.pow(2, retryCountRef.current - 1) + jitter,
        30000 // Max 30s delay
      );

      // Show appropriate message
      if (errorCategory.requiresUserAction) {
        toast.error(`${errorMessage}. Retrying after user action...`, {
          duration: 5000,
          action: {
            label: 'Retry Now',
            onClick: () => startSync()
          }
        });
      } else {
        toast.error(`Sync failed, retrying in ${Math.round(retryDelay/1000)}s... (${retryCountRef.current}/${errorCategory.maxRetries})`, {
          duration: Math.min(retryDelay, 5000)
        });
        
      setOperationTimeout(
          `retry-${errorEntry.id}`,
        () => startSync(),
        retryDelay
      );
      }

      // Emit retry scheduled event
      emit('sync:retryScheduled', {
        errorId: errorEntry.id,
        retryCount: retryCountRef.current,
        delay: retryDelay,
        errorType
      });
    } else {
      retryCountRef.current = 0; // Reset for next sync attempt
      
      // Show final error message
      const errorMessage = errorCategory.requiresUserAction
        ? 'Action required: Please check your settings and try again'
        : 'Sync failed after multiple retries. Please try again later';
      
      toast.error(errorMessage, {
        duration: 5000,
        action: {
          label: 'Details',
          onClick: () => {
            // Show error details modal/popup
            emit('sync:showErrorDetails', errorEntry);
          }
        }
      });
    }

    // Log error for debugging
    logger.error('[useContactSync] Sync error handled:', {
      error: errorEntry,
      recentErrors: recentErrors.length,
      similarErrors,
      willRetry: errorCategory.retryable && retryCountRef.current < errorCategory.maxRetries
    });
  }, [
    clearOperationTimeouts,
    setOperationTimeout,
    updateSyncState,
    syncState,
    isConnected,
    emit,
    startSync
  ]);

  // Add error monitoring
  useEffect(() => {
    // Monitor for error patterns
    const errorMonitorInterval = setInterval(() => {
      const recentErrors = errorHistoryRef.current
        .filter(e => Date.now() - e.timestamp < 15 * 60 * 1000); // Last 15 minutes

      if (recentErrors.length >= 5) {
        const errorTypes = new Set(recentErrors.map(e => e.type));
        
        logger.warn('[useContactSync] High error rate detected:', {
          errorCount: recentErrors.length,
          uniqueTypes: Array.from(errorTypes),
          timeWindow: '15 minutes'
        });

        // Emit error pattern detected
        emit('sync:errorPatternDetected', {
          errorCount: recentErrors.length,
          errorTypes: Array.from(errorTypes),
          timeWindow: 15 * 60 * 1000
        });
      }
    }, 60000); // Check every minute

    return () => {
      clearInterval(errorMonitorInterval);
      errorHistoryRef.current = [];
    };
  }, [emit]);

  // Add debug helper for error history
  const getErrorHistory = useCallback(() => ({
    all: errorHistoryRef.current,
    recent: errorHistoryRef.current
      .filter(e => Date.now() - e.timestamp < 15 * 60 * 1000),
    patterns: analyzeErrorPatterns(errorHistoryRef.current)
  }), []);

  // Error pattern analysis helper
  const analyzeErrorPatterns = (errors) => {
    const patterns = {
      byType: {},
      byTimeWindow: {
        '5m': [],
        '15m': [],
        '1h': []
      },
      repeated: []
    };

    // Analyze by type
    errors.forEach(error => {
      if (!patterns.byType[error.type]) {
        patterns.byType[error.type] = [];
      }
      patterns.byType[error.type].push(error);
    });

    // Analyze by time window
    const now = Date.now();
    patterns.byTimeWindow['5m'] = errors
      .filter(e => now - e.timestamp < 5 * 60 * 1000);
    patterns.byTimeWindow['15m'] = errors
      .filter(e => now - e.timestamp < 15 * 60 * 1000);
    patterns.byTimeWindow['1h'] = errors
      .filter(e => now - e.timestamp < 60 * 60 * 1000);

    // Find repeated errors
    Object.entries(patterns.byType).forEach(([type, typeErrors]) => {
      if (typeErrors.length >= 3) {
        patterns.repeated.push({
          type,
          count: typeErrors.length,
          firstSeen: Math.min(...typeErrors.map(e => e.timestamp)),
          lastSeen: Math.max(...typeErrors.map(e => e.timestamp))
        });
      }
    });

    return patterns;
  };

  // Helper functions
  const isRetryableError = useCallback((errorType) => {
    const RETRYABLE_ERRORS = ['NETWORK', 'TIMEOUT', 'RATE_LIMIT'];
    return RETRYABLE_ERRORS.includes(errorType);
  }, []);

  const calculateRetryDelay = useCallback((retryCount, errorType) => {
    const baseDelay = 1000;
    const maxDelay = 30000;
    
    let delay = Math.min(
      baseDelay * Math.pow(2, retryCount - 1),
      maxDelay
    );

    // Adjust delay based on error type
    if (errorType === 'RATE_LIMIT') {
      delay = Math.max(delay, 5000); // Minimum 5s for rate limits
    }

    return delay;
  }, []);

  const handleSyncProgress = useCallback((data) => {
    if (!data || typeof data.progress !== 'number') {
      logger.warn('[useContactSync] Invalid progress data received:', data);
      return;
    }

    updateProgress(data.progress, data.details);
  }, [updateProgress]);

  const handleSyncStatus = useCallback((data) => {
    if (!data || !data.state) {
      logger.warn('[useContactSync] Invalid status data received:', data);
      return;
    }

    setSyncState(prev => {
      // Validate state transition
      if (!isValidStateTransition(prev.state, data.state)) {
        logger.warn('[useContactSync] Invalid state transition:', {
          from: prev.state,
          to: data.state
        });
        return prev;
      }

      return {
        ...prev,
        state: data.state,
        error: data.error,
        lastSync: data.timestamp
      };
    });

    if (data.state === SYNC_STATES.APPROVED) {
      clearAllTimeouts();
      retryCountRef.current = 0;
      toast.success('Sync completed successfully');
    } else if (data.state === SYNC_STATES.REJECTED) {
      toast.error('Sync rejected: ' + (data.error || 'Unknown error'));
    }
  }, [clearAllTimeouts]);

  const handleCriticalError = useCallback((data) => {
    clearAllTimeouts();
    retryCountRef.current = MAX_RETRIES; // Prevent further retries

    setSyncState(prev => ({
      ...prev,
      state: SYNC_STATES.ERROR,
      error: data?.error || 'Critical error occurred',
      details: 'Critical sync error occurred',
      errors: [...prev.errors, { 
        message: data?.error || 'Critical error occurred',
        timestamp: Date.now(),
        isCritical: true
      }]
    }));

    toast.error('Critical sync error: ' + (data?.error || 'Unknown error'));
  }, [clearAllTimeouts]);

  const startSync = useCallback(async () => {
    if (!socket || !isConnected || !userId) {
      toast.error('Cannot start sync: No connection');
      return;
    }

    try {
      clearAllTimeouts();

      setSyncState(prev => ({
        ...prev,
        state: SYNC_STATES.SYNCING,
        progress: 0,
        error: null,
        details: 'Starting sync...'
      }));

      // Set sync timeout
      syncTimeoutRef.current = setTrackedTimeout(() => {
        setSyncState(prev => ({
          ...prev,
          state: SYNC_STATES.ERROR,
          error: 'Sync timeout',
          details: 'Sync operation timed out'
        }));
        toast.error('Sync operation timed out');
      }, 30000);

      socket.emit('whatsapp:sync:start', { userId });
      
    } catch (error) {
      logger.error('[useContactSync] Error starting sync:', error);
      setSyncState(prev => ({
        ...prev,
        state: SYNC_STATES.ERROR,
        error: error.message,
        details: 'Failed to start sync'
      }));
      toast.error('Failed to start sync');
    }
  }, [socket, isConnected, userId, clearAllTimeouts, setTrackedTimeout]);

  // Load contacts with progress tracking
  const loadContacts = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      syncStateManager.update({
        state: SYNC_STATES.SYNCING,
        progress: 0,
        details: 'Initializing contact sync...'
      });

      // Try cache first if not forcing refresh
      if (!forceRefresh) {
        const cachedContacts = await contactService.getCachedContacts();
        if (cachedContacts?.length > 0) {
          setContacts(cachedContacts);
          setLoading(false);
          syncStateManager.update({
            state: SYNC_STATES.APPROVED,
            progress: 100,
            details: 'Loaded from cache'
          });

          // Check if background sync needed
          if (!lastSyncRef.current || Date.now() - lastSyncRef.current > 5 * 60 * 1000) {
            backgroundSync();
          }
          return;
        }
      }

      // Load from API
      syncStateManager.updateProgress(20, 'Fetching contacts from server...');

      const response = await retryManager.withRetry('load-contacts', async () => {
        const res = await api.get('/api/v1/whatsapp/contacts');
        const data = await res.json();
        if (!data?.contacts) throw new Error('Invalid response format');
        return data;
      });

      setContacts(response.contacts);
      setError(null);
      lastSyncRef.current = Date.now();
      
      // Cache results
      await contactService.cacheContacts(response.contacts);

      syncStateManager.update({
        state: SYNC_STATES.APPROVED,
        progress: 100,
        details: 'Contacts loaded successfully'
      });

      toast.success('Contacts synced successfully');
      
    } catch (error) {
      console.error('Failed to load contacts:', error);
      setError('Failed to load contacts. Please try again.');
      syncStateManager.setError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Background sync with progress updates
  const backgroundSync = useCallback(async () => {
    if (syncStateManager.isInProgress()) return;

    try {
      syncStateManager.update({
        state: SYNC_STATES.SYNCING,
        progress: 0,
        details: 'Starting background sync...'
      });

      await emit('whatsapp:request_sync');
      
      // Monitor sync progress
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const status = await contactService.getSyncStatus();

        syncStateManager.updateProgress(
          Math.min((attempts + 1) * 10, 90),
          `Syncing contacts (${Math.min((attempts + 1) * 10, 90)}%)`
        );
        
        if (status === 'completed') {
          await loadContacts(true);
          break;
        }
        
        if (status === 'error') {
          throw new Error('Background sync failed');
        }
        
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Background sync timed out');
      }
      
    } catch (error) {
      console.error('Background sync failed:', error);
      syncStateManager.setError(error);
    }
  }, [emit, loadContacts]);

  // Socket event management
  useEffect(() => {
    if (!socket || !isConnected) return;

    socketManager.current = new SocketEventManager(
      socket,
      createSyncHandlers(syncStateManager, () => loadContacts(true))
    );

    socketManager.current.subscribe();

    socket.on('whatsapp:sync_progress', handleSyncProgress);
    socket.on('whatsapp:sync_status', handleSyncStatus);
    socket.on('whatsapp:sync_error', handleSyncError);
    socket.on('whatsapp:critical_error', handleCriticalError);

    // Handle connection loss
    socket.on('disconnect', () => {
      setSyncState(prev => ({
        ...prev,
        state: SYNC_STATES.ERROR,
        error: 'Connection lost',
        details: 'Socket connection lost'
      }));
    });

    return () => {
      socketManager.current?.unsubscribe();
      socket.off('whatsapp:sync_progress', handleSyncProgress);
      socket.off('whatsapp:sync_status', handleSyncStatus);
      socket.off('whatsapp:sync_error', handleSyncError);
      socket.off('whatsapp:critical_error', handleCriticalError);
      socket.off('disconnect');
      
      clearAllTimeouts();
    };
  }, [
    socket, 
    isConnected, 
    loadContacts, 
    handleSyncProgress, 
    handleSyncStatus, 
    handleSyncError, 
    handleCriticalError,
    clearAllTimeouts
  ]);

  // Initial load
  useEffect(() => {
    loadContacts();
    return () => {
      retryManager.resetAll();
    };
  }, [loadContacts]);

  // Manual refresh function
  const refreshContacts = useCallback(async () => {
    try {
      syncStateManager.update({
        state: SYNC_STATES.SYNCING,
        progress: 0,
        details: 'Starting manual sync...'
      });

      await loadContacts(true);
    } catch (error) {
      console.error('Failed to refresh contacts:', error);
      syncStateManager.setError(error);
    }
  }, [loadContacts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearOperationTimeouts();
      stateHistoryRef.current = [];
      retryCountRef.current = 0;
    };
  }, [clearOperationTimeouts]);

  return {
    contacts,
    loading,
    error,
    syncState,
    refreshContacts,
    startSync,
    isConnected,
    // Add debug helpers
    getStateHistory: () => stateHistoryRef.current,
    getPendingOperations: () => Array.from(operationTimeoutsRef.current.values()),
    getErrorHistory: getErrorHistory,
    analyzeErrorPatterns: analyzeErrorPatterns
  };
} 