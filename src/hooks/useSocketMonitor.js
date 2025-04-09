import { useEffect, useRef, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { setSocketHealth, setAuthenticated } from '../store/slices/socketSlice';
import tokenService from '../services/tokenService';
import logger from '../utils/logger';

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const STALE_CONNECTION_THRESHOLD = 45000; // 45 seconds
const CRITICAL_THRESHOLD = 60000; // 60 seconds
const MAX_MISSED_HEARTBEATS = 3;

export const useSocketMonitor = (socket) => {
  const dispatch = useDispatch();
  const [metrics, setMetrics] = useState(null);
  const healthCheckRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const missedHeartbeatsRef = useRef(0);
  const recoveryAttemptsRef = useRef(0);
  const lastMetricsRef = useRef(null);
  const tokenUnsubscribeRef = useRef(null);
  const MAX_RECOVERY_ATTEMPTS = 3;

  const updateMetrics = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityRef.current;
    
    const currentMetrics = {
      connected: socket.connected,
      authenticated: socket.auth?.authenticated || false,
      lastActivity: lastActivityRef.current,
      timeSinceLastActivity,
      missedHeartbeats: missedHeartbeatsRef.current,
      recoveryAttempts: recoveryAttemptsRef.current,
      reconnectAttempts: socket.reconnectAttempts || 0,
      rooms: Array.from(socket.rooms || []),
      pendingOperations: Array.from(socket.pendingOperations || [])
    };

    // Only update metrics if there are meaningful changes
    if (!lastMetricsRef.current || hasMetricsChanged(currentMetrics, lastMetricsRef.current)) {
      setMetrics(currentMetrics);
      lastMetricsRef.current = currentMetrics;

      // Determine health status with more granular checks
      const isHealthy = currentMetrics.connected && 
        currentMetrics.authenticated &&
        timeSinceLastActivity < STALE_CONNECTION_THRESHOLD &&
        missedHeartbeatsRef.current < MAX_MISSED_HEARTBEATS;

      const healthStatus = {
        isHealthy,
        lastChecked: now,
        metrics: currentMetrics,
        status: getConnectionStatus(currentMetrics)
      };

      dispatch(setSocketHealth(healthStatus));
      
      // Update authentication state if changed
      if (currentMetrics.authenticated !== lastMetricsRef.current?.authenticated) {
        dispatch(setAuthenticated(currentMetrics.authenticated));
      }
    }

    return currentMetrics;
  }, [socket, dispatch]);

  const handleTokenUpdate = useCallback(async (newTokens) => {
    if (!socket?.connected) return;

    try {
      // Validate token before updating socket
      if (!tokenService.validateToken(newTokens.access_token)) {
        throw new Error('Invalid token received');
      }

      socket.auth.token = newTokens.access_token;
      socket.auth.userId = newTokens.userId;
      
      // Force socket to reauthenticate with new token
      socket.emit('auth:refresh', { token: newTokens.access_token });
      
      logger.info('Socket authentication updated with new token');
    } catch (error) {
      logger.error('Failed to update socket authentication:', error);
      await attemptRecovery();
    }
  }, [socket]);

  const hasMetricsChanged = (current, last) => {
    if (!last) return true;
    
    return (
      current.connected !== last.connected ||
      current.authenticated !== last.authenticated ||
      current.missedHeartbeats !== last.missedHeartbeats ||
      current.recoveryAttempts !== last.recoveryAttempts ||
      current.reconnectAttempts !== last.reconnectAttempts ||
      !arraysEqual(current.rooms, last.rooms) ||
      !arraysEqual(current.pendingOperations, last.pendingOperations) ||
      Math.abs(current.timeSinceLastActivity - last.timeSinceLastActivity) > 5000 // Only log significant time changes
    );
  };

  const arraysEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  };

  const getConnectionStatus = useCallback((metrics) => {
    if (!metrics.connected) return 'disconnected';
    if (!metrics.authenticated) return 'unauthenticated';
    if (metrics.timeSinceLastActivity >= CRITICAL_THRESHOLD) return 'critical';
    if (metrics.timeSinceLastActivity >= STALE_CONNECTION_THRESHOLD) return 'stale';
    if (metrics.missedHeartbeats > 0) return 'degraded';
    return 'healthy';
  }, []);

  const attemptRecovery = useCallback(async () => {
    if (recoveryAttemptsRef.current >= MAX_RECOVERY_ATTEMPTS) {
      logger.warn('Max recovery attempts reached, manual intervention required', {
        missedHeartbeats: missedHeartbeatsRef.current,
        recoveryAttempts: recoveryAttemptsRef.current,
        lastActivity: new Date(lastActivityRef.current).toISOString()
      });
      return false;
    }

    recoveryAttemptsRef.current++;
    
    try {
      if (socket.connected) {
        logger.info('Attempting socket recovery by forcing reconnection');
        await socket.disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.connect();
      } else {
        logger.info('Attempting socket recovery by initiating new connection');
        await socket.connect();
      }
      
      return true;
    } catch (error) {
      logger.error('Socket recovery attempt failed:', error);
      return false;
    }
  }, [socket]);

  const checkHealth = useCallback(async () => {
    const currentMetrics = updateMetrics();
    
    // Check for missed heartbeats
    if (currentMetrics.timeSinceLastActivity > STALE_CONNECTION_THRESHOLD) {
      missedHeartbeatsRef.current++;
      
      if (missedHeartbeatsRef.current === 1) { // Log only on first detection
        logger.warn('Potential stale connection detected', {
          timeSinceLastActivity: currentMetrics.timeSinceLastActivity,
          missedHeartbeats: missedHeartbeatsRef.current,
          threshold: STALE_CONNECTION_THRESHOLD
        });
      }

      // Attempt recovery if we've missed too many heartbeats
      if (missedHeartbeatsRef.current >= MAX_MISSED_HEARTBEATS) {
        logger.error('Connection considered stale, attempting recovery', {
          missedHeartbeats: missedHeartbeatsRef.current,
          recoveryAttempts: recoveryAttemptsRef.current
        });
        
        const recovered = await attemptRecovery();
        if (recovered) {
          missedHeartbeatsRef.current = 0;
        }
      }
    }

    // Check for critical timeout (log only on transition to critical)
    if (currentMetrics.timeSinceLastActivity >= CRITICAL_THRESHOLD &&
        (!lastMetricsRef.current || lastMetricsRef.current.timeSinceLastActivity < CRITICAL_THRESHOLD)) {
      logger.error('Critical connection timeout detected', {
        timeSinceLastActivity: currentMetrics.timeSinceLastActivity,
        threshold: CRITICAL_THRESHOLD,
        socketState: {
          connected: socket.connected,
          authenticated: socket.auth?.authenticated
        }
      });
    }
  }, [socket, updateMetrics, attemptRecovery]);

  // Reset counters on successful activity
  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    missedHeartbeatsRef.current = 0;
    recoveryAttemptsRef.current = 0;
    updateMetrics();
  }, [updateMetrics]);

  useEffect(() => {
    if (!socket) return;

    // Subscribe to token updates
    tokenUnsubscribeRef.current = tokenService.subscribe(handleTokenUpdate);

    // Track various socket events
    const events = [
      'connect', 'disconnect', 'error', 'reconnect',
      'reconnect_attempt', 'reconnect_error', 'reconnect_failed',
      'ping', 'pong', 'auth:success', 'auth:error',
      'heartbeat', 'heartbeat_ack'
    ];

    events.forEach(event => socket.on(event, handleActivity));

    // Start health check interval
    healthCheckRef.current = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);

    // Initial health check
    checkHealth();

    return () => {
      // Clean up event listeners
      events.forEach(event => socket.off(event, handleActivity));
      
      // Clear intervals
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }

      // Unsubscribe from token updates
      if (tokenUnsubscribeRef.current) {
        tokenUnsubscribeRef.current();
        tokenUnsubscribeRef.current = null;
      }

      // Reset refs
      lastMetricsRef.current = null;
      missedHeartbeatsRef.current = 0;
      recoveryAttemptsRef.current = 0;
    };
  }, [socket, handleActivity, checkHealth, handleTokenUpdate]);

  return metrics;
}; 