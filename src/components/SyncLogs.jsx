import React from 'react';

const SyncLogs = ({ logs, maxHeight = '300px' }) => {
  return (
    <div className="mt-4 text-left">
      <h3 className="text-lg font-semibold text-white mb-2">Sync Logs</h3>
      <div 
        className="bg-dark-lighter rounded-lg p-4 overflow-auto"
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <p className="text-gray-500 text-sm">No logs available yet...</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div 
                key={index}
                className={`text-sm font-mono ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  'text-gray-300'
                }`}
              >
                <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                <span className="text-gray-400">[{log.type.toUpperCase()}]</span>{' '}
                {log.message}
                {log.details && (
                  <div className="ml-6 mt-1 text-gray-500 text-xs">
                    {JSON.stringify(log.details, null, 2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncLogs; 