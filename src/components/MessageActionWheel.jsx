import React, { useState } from 'react';
import { FiCornerUpLeft, FiTrash2, FiThumbsUp, FiBookmark } from 'react-icons/fi';
import '../styles/messageActionWheel.css';
import logger from '../utils/logger';

/**
 * A semi-circular action wheel that appears when hovering over a message
 * Provides options to reply, delete, pin, and react to messages
 */
const MessageActionWheel = ({ message, onReply, onDelete, onPin, onReact }) => {
  const [hoveredAction, setHoveredAction] = useState(null);

  // Define the actions with their icons, tooltips, and handlers
  const actions = [
    {
      id: 'reply',
      icon: <FiCornerUpLeft size={18} />,
      tooltip: 'Reply',
      handler: () => {
        logger.info(`[MessageActionWheel] Reply to message: ${message.id}`);
        onReply(message);
      },
      color: '#0088cc', // Telegram blue
    },
    {
      id: 'delete',
      icon: <FiTrash2 size={18} />,
      tooltip: 'Delete',
      handler: () => {
        logger.info(`[MessageActionWheel] Delete message: ${message.id}`);
        onDelete?.(message);
      },
      color: '#e74c3c', // Red
    },
    {
      id: 'pin',
      icon: <FiBookmark size={18} />,
      tooltip: 'Pin',
      handler: () => {
        logger.info(`[MessageActionWheel] Pin message: ${message.id}`);
        onPin?.(message);
      },
      color: '#f39c12', // Orange
    },
    {
      id: 'react',
      icon: <FiThumbsUp size={18} />,
      tooltip: 'React',
      handler: () => {
        logger.info(`[MessageActionWheel] React to message: ${message.id}`);
        onReact?.(message);
      },
      color: '#2ecc71', // Green
    },
  ];

  return (
    <div className="message-action-wheel">
      <div className="wheel-container">
        {actions.map((action, index) => {
          // Calculate position in the semi-circle (180 degrees, starting from bottom)
          // We want to distribute the actions evenly in a semicircle
          // For 4 actions, we want angles at approximately: -45, -15, 15, 45 degrees
          // This creates a nice arc above the avatar
          const startAngle = -90; // Start from bottom
          const arcAngle = 180; // Semicircle
          const angle = startAngle + (index / (actions.length - 1)) * arcAngle;
          const radian = (angle * Math.PI) / 180;

          // Calculate x and y coordinates on the semi-circle
          // Radius is set to 50 (will be scaled with CSS)
          const x = 50 + Math.cos(radian) * 50;
          const y = 50 + Math.sin(radian) * 50;

          return (
            <div
              key={action.id}
              className={`wheel-action ${hoveredAction === action.id ? 'hovered' : ''}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                backgroundColor: action.color,
                '--index': index,
              }}
              onClick={(e) => {
                e.stopPropagation();
                action.handler();
              }}
              onMouseEnter={() => setHoveredAction(action.id)}
              onMouseLeave={() => setHoveredAction(null)}
            >
              <div className="action-icon">{action.icon}</div>
              {hoveredAction === action.id && (
                <div className="action-tooltip" style={{ backgroundColor: action.color }}>
                  {action.tooltip}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MessageActionWheel;
