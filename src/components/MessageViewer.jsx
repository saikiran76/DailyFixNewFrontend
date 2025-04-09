import React, { useState, useEffect, useRef } from 'react';
// import axios from '../utils/axios';
// import PriorityFilter from './PriorityFilter';
// import ResponseSuggestions from './ResponseSuggestions';

const MessageViewer = ({ messages }) => {
  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="flex-1 p-4 space-y-4">
        {messages.map(message => (
          <div key={message.id}
            className="max-w-[70%] bg-gray-700 text-white p-3 rounded-lg border-l-4 border-primary">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-300">{message.senderName}</span>
              <span className="text-xs px-2 py-1 rounded-full bg-yellow-500 text-yellow-100">
                {message.priority}
              </span>
            </div>
            <div className="break-words">{message.content}</div>
            <div className="text-xs text-gray-400 mt-1">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MessageViewer;
