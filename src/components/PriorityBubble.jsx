import React from 'react';
import { PRIORITY_LEVELS } from '../store/slices/contactSlice';
import '../styles/PriorityBubble.css';

const PriorityBubble = ({ priority }) => {
  const getBubbleClass = () => {
    switch (priority) {
      case PRIORITY_LEVELS.HIGH:
        return 'bubble-high';
      case PRIORITY_LEVELS.MEDIUM:
        return 'bubble-medium';
      case PRIORITY_LEVELS.LOW:
        return 'bubble-low';
      default:
        return 'bubble-medium';
    }
  };

  return (
    <div 
      className={`priority-bubble ${getBubbleClass()}`}
      title={`${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority`}
    />
  );
};

export default PriorityBubble; 