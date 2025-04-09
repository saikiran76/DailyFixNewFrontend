import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { SYNC_STATES, SYNC_MESSAGES } from '../utils/syncUtils';

const defaultTheme = {
  container: 'px-4 py-2 bg-[#1a1b26] border-b border-gray-700',
  text: {
    primary: 'text-sm text-gray-300',
    secondary: 'text-sm text-gray-400'
  },
  progressBar: {
    container: 'w-full h-1 bg-gray-700 rounded-full overflow-hidden',
    indicator: {
      base: 'h-full transition-all duration-300',
      states: {
        [SYNC_STATES.SYNCING]: 'bg-blue-500',
        [SYNC_STATES.APPROVED]: 'bg-green-500',
        [SYNC_STATES.REJECTED]: 'bg-red-500',
        [SYNC_STATES.IDLE]: 'bg-gray-500'
      }
    }
  },
  retryButton: 'text-sm text-blue-400 hover:text-blue-300'
};

const SyncProgressIndicator = ({
  syncState,
  theme = defaultTheme,
  showRetry = true,
  onRetry = () => window.location.reload(),
  getCustomMessage,
  hideWhenIdle = true
}) => {
  if (!syncState || (hideWhenIdle && syncState.state === SYNC_STATES.IDLE)) {
    return null;
  }

  const getMessage = () => {
    if (getCustomMessage) {
      return getCustomMessage(syncState);
    }

    switch (syncState.state) {
      case SYNC_STATES.SYNCING:
        return syncState.details || SYNC_MESSAGES[SYNC_STATES.SYNCING];
      case SYNC_STATES.APPROVED:
        return syncState.details || SYNC_MESSAGES[SYNC_STATES.APPROVED];
      case SYNC_STATES.REJECTED:
        return `${SYNC_MESSAGES[SYNC_STATES.REJECTED]}: ${
          syncState.errors?.[0]?.message || 'Unknown error'
        }`;
      default:
        return SYNC_MESSAGES[syncState.state];
    }
  };

  const getProgressBarColor = () => {
    return theme.progressBar.indicator.states[syncState.state] || theme.progressBar.indicator.states[SYNC_STATES.IDLE];
  };

  return (
    <div className={theme.container}>
      <div className="flex items-center justify-between mb-2">
        <span className={theme.text.primary}>{getMessage()}</span>
        {syncState.state === SYNC_STATES.SYNCING && (
          <span className={theme.text.secondary}>
            {Math.round(syncState.progress)}%
          </span>
        )}
      </div>
      <div className={theme.progressBar.container}>
        <div
          className={`${theme.progressBar.indicator.base} ${getProgressBarColor()}`}
          style={{
            width: `${syncState.state === SYNC_STATES.APPROVED ? 100 : syncState.progress}%`
          }}
        />
      </div>
      {showRetry && syncState.state === SYNC_STATES.REJECTED && syncState.errors?.length > 0 && (
        <div className="mt-2">
          <button
            onClick={onRetry}
            className={theme.retryButton}
          >
            Retry sync
          </button>
        </div>
      )}
    </div>
  );
};

SyncProgressIndicator.propTypes = {
  syncState: PropTypes.shape({
    state: PropTypes.oneOf(Object.values(SYNC_STATES)).isRequired,
    progress: PropTypes.number,
    details: PropTypes.string,
    errors: PropTypes.arrayOf(
      PropTypes.shape({
        message: PropTypes.string.isRequired,
        timestamp: PropTypes.number
      })
    )
  }).isRequired,
  theme: PropTypes.shape({
    container: PropTypes.string,
    text: PropTypes.shape({
      primary: PropTypes.string,
      secondary: PropTypes.string
    }),
    progressBar: PropTypes.shape({
      container: PropTypes.string,
      indicator: PropTypes.shape({
        base: PropTypes.string,
        states: PropTypes.objectOf(PropTypes.string)
      })
    }),
    retryButton: PropTypes.string
  }),
  showRetry: PropTypes.bool,
  onRetry: PropTypes.func,
  getCustomMessage: PropTypes.func,
  hideWhenIdle: PropTypes.bool
};

export default memo(SyncProgressIndicator);