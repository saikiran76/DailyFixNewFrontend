import React from 'react';
import { useSelector } from 'react-redux';
import { FiWifi, FiWifiOff } from 'react-icons/fi';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import logger from '../utils/logger';
import '../styles/connectionStatus.css';

/**
 * A component that displays the connection status for a specific platform
 * @param {Object} props - Component props
 * @param {string} props.platform - The platform to show status for (whatsapp, telegram)
 * @param {boolean} props.showLabel - Whether to show the text label (default: false)
 * @param {string} props.size - Size of the indicator (sm, md, lg) (default: md)
 */
const ConnectionStatusIndicator = ({ platform, showLabel = false, size = 'md' }) => {
  // In a real implementation, this would come from Redux
  // For now, we'll simulate it with localStorage
  const getConnectionStatus = () => {
    try {
      const connectionStatus = JSON.parse(localStorage.getItem('dailyfix_connection_status') || '{}');
      if (connectionStatus[platform]) {
        return 'connected';
      }
      
      // Check if we're currently connecting
      if (sessionStorage.getItem(`connecting_to_${platform}`) === 'true') {
        return 'connecting';
      }
      
      return 'disconnected';
    } catch (error) {
      logger.error('[ConnectionStatusIndicator] Error getting connection status:', error);
      return 'disconnected';
    }
  };
  
  const status = getConnectionStatus();
  
  // Determine size classes
  const sizeClasses = {
    sm: 'w-2 h-2 text-xs',
    md: 'w-3 h-3 text-sm',
    lg: 'w-4 h-4 text-base'
  };
  
  const dotSize = sizeClasses[size] || sizeClasses.md;
  
  // Render the appropriate icon based on status
  const renderStatusIcon = () => {
    switch (status) {
      case 'connected':
        return (
          <div className={`${dotSize} rounded-full bg-green-500 pulse-subtle`} 
               title={`${platform.charAt(0).toUpperCase() + platform.slice(1)} Connected`} />
        );
      case 'connecting':
        return (
          <AiOutlineLoading3Quarters 
            className={`${dotSize} text-yellow-500 animate-spin`} 
            title={`Connecting to ${platform.charAt(0).toUpperCase() + platform.slice(1)}`} />
        );
      case 'disconnected':
      default:
        return (
          <div className={`${dotSize} rounded-full bg-gray-400`} 
               title={`${platform.charAt(0).toUpperCase() + platform.slice(1)} Disconnected`} />
        );
    }
  };
  
  return (
    <div className={`connection-status-indicator flex items-center ${showLabel ? 'space-x-1.5' : ''}`}>
      {renderStatusIcon()}
      {showLabel && (
        <span className={`connection-status-label ${status} text-xs font-medium`}>
          {status === 'connected' && 'Connected'}
          {status === 'connecting' && 'Connecting...'}
          {status === 'disconnected' && 'Disconnected'}
        </span>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;
