import React, { useState } from 'react';
import { FiCornerUpLeft, FiTrash2, FiThumbsUp, FiBookmark } from 'react-icons/fi';
import '../styles/messageActionWheel.css';
import logger from '../utils/logger';

/**
 * A horizontal action bar that appears when hovering over a message
 * Provides options to reply, delete, pin, and react to messages
 */
const MessageActionWheel = ({ message, onReply, onDelete, onPin, onReact }) => {
  const [hoveredAction, setHoveredAction] = useState(null);

  // Define the actions with their icons, tooltips, and handlers
  const actions = [
    {
      id: 'reply',
      icon: <FiCornerUpLeft size={16} />,
      tooltip: 'Reply',
      handler: () => {
        logger.info(`[MessageActionWheel] Reply to message: ${message.id}`);
        onReply(message);
      },
      color: '#0088cc', // Telegram blue
    },
    {
      id: 'react',
      icon: <FiThumbsUp size={16} />,
      tooltip: 'React',
      handler: () => {
        logger.info(`[MessageActionWheel] React to message: ${message.id}`);
        onReact?.(message);
      },
      color: '#2ecc71', // Green
    },
    {
      id: 'pin',
      icon: <FiBookmark size={16} />,
      tooltip: 'Pin',
      handler: () => {
        logger.info(`[MessageActionWheel] Pin message: ${message.id}`);
        onPin?.(message);
      },
      color: '#f39c12', // Orange
    },
    {
      id: 'delete',
      icon: <FiTrash2 size={16} />,
      tooltip: 'Delete',
      handler: () => {
        logger.info(`[MessageActionWheel] Delete message: ${message.id}`);
        onDelete?.(message);
      },
      color: '#e74c3c', // Red
    },
  ];

  return (
    <div className="action-buttons-container">
      {actions.map((action, index) => (
        <button
          key={action.id}
          className="action-button"
          style={{ backgroundColor: action.color }}
          onClick={(e) => {
            e.stopPropagation();
            action.handler();
          }}
          onMouseEnter={() => setHoveredAction(action.id)}
          onMouseLeave={() => setHoveredAction(null)}
          aria-label={action.tooltip}
        >
          <div className="action-icon">{action.icon}</div>
          {hoveredAction === action.id && (
            <div className="action-tooltip" style={{ backgroundColor: action.color }}>
              {action.tooltip}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

export default MessageActionWheel;
