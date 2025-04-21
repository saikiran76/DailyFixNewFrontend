import React from 'react';
import '../styles/dateSeparator.css';

/**
 * A component that displays a date separator between messages
 * @param {Object} props - Component props
 * @param {Date|number} props.date - The date to display
 */
const DateSeparator = ({ date }) => {
  // Convert to Date object if it's a timestamp
  const dateObj = date instanceof Date ? date : new Date(date);
  
  // Format the date
  const formattedDate = formatDate(dateObj);
  
  return (
    <div className="date-separator">
      <div className="date-separator-line"></div>
      <div className="date-separator-text">{formattedDate}</div>
      <div className="date-separator-line"></div>
    </div>
  );
};

/**
 * Format a date for display in the date separator
 * @param {Date} date - The date to format
 * @returns {string} - The formatted date
 */
const formatDate = (date) => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Check if the date is today
  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  }
  
  // Check if the date is yesterday
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  // Format the date as "Month Day, Year"
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

export default DateSeparator;
