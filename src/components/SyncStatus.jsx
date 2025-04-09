import React, { useEffect } from 'react';
import { useSync } from '../hooks/useSync';
import logger from '../utils/logger';

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function SyncStatus({ onSyncComplete }) {
  const {
    syncState,
    isSyncing,
    startSync,
    cancelSync
  } = useSync('full');

  // Periodic sync
  useEffect(() => {
    let syncTimer;

    const scheduleSyncCheck = () => {
      syncTimer = setTimeout(async () => {
        try {
          if (!isSyncing) {
            await startSync();
          }
        } catch (error) {
          logger.info('[SyncStatus] Periodic sync error:', error);
        } finally {
          scheduleSyncCheck();
        }
      }, SYNC_INTERVAL);
    };

    scheduleSyncCheck();

    return () => {
      if (syncTimer) {
        clearTimeout(syncTimer);
      }
    };
  }, [isSyncing, startSync]);

  // Notify parent when sync completes
  useEffect(() => {
    if (syncState.state === 'success' && onSyncComplete) {
      onSyncComplete();
    }
  }, [syncState.state, onSyncComplete]);

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleTimeString();
  };

  const renderProgress = () => {
    if (!isSyncing) return null;

    return (
      <div className="flex flex-col space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Contacts: {syncState.progress.contacts}%</span>
          <span>Messages: {syncState.progress.messages}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{
              width: `${Math.max(
                syncState.progress.contacts,
                syncState.progress.messages
              )}%`
            }}
          />
        </div>
      </div>
    );
  };

  const renderError = () => {
    if (!syncState.error) return null;

    return (
      <div className="text-red-500 text-sm mt-2">
        Error: {syncState.error.message}
      </div>
    );
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Sync Status</h3>
        <div className="flex items-center space-x-2">
          {isSyncing ? (
            <button
              onClick={cancelSync}
              className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={startSync}
              className="px-3 py-1 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Sync Now
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Status:</span>
          <span className={`font-medium ${
            syncState.state === 'error' ? 'text-red-600' :
            syncState.state === 'syncing' ? 'text-blue-600' :
            syncState.state === 'success' ? 'text-green-600' :
            'text-gray-600'
          }`}>
            {syncState.state.charAt(0).toUpperCase() + syncState.state.slice(1)}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Last Sync:</span>
          <span className="font-medium">
            {formatTime(syncState.lastSync?.timestamp)}
          </span>
        </div>

        {renderProgress()}
        {renderError()}
      </div>
    </div>
  );
} 