import React, { useState, useRef, useEffect } from 'react';
import { FiChevronDown, FiChevronRight, FiStar, FiMessageCircle, FiAtSign, FiUser, FiUsers, FiHash, FiVolumeX, FiArchive } from 'react-icons/fi';
import { getCategoryDisplayName, getCategoryIcon } from '../utils/contactOrganizer';

const ContactCategory = ({
  category,
  contacts,
  onContactSelect,
  selectedContactId,
  isExpanded: initialExpanded = true,
  onPinContact,
  onMuteContact,
  onArchiveContact
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [activeContactId, setActiveContactId] = useState(null);
  const contextMenuRef = useRef(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setContextMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!contacts || contacts.length === 0) {
    return null;
  }

  // Handle context menu
  const handleContextMenu = (e, contact) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveContactId(contact.id);
    setContextMenuOpen(true);
  };

  // Get the appropriate icon for the category
  const getIcon = () => {
    const iconName = getCategoryIcon(category);
    switch (iconName) {
      case 'star': return <FiStar className="text-yellow-400" />;
      case 'message-circle': return <FiMessageCircle className="text-green-500" />;
      case 'at-sign': return <FiAtSign className="text-blue-500" />;
      case 'user': return <FiUser className="text-purple-500" />;
      case 'users': return <FiUsers className="text-indigo-500" />;
      case 'hash': return <FiHash className="text-pink-500" />;
      case 'volume-x': return <FiVolumeX className="text-gray-500" />;
      case 'archive': return <FiArchive className="text-amber-500" />;
      default: return <FiMessageCircle className="text-gray-400" />;
    }
  };

  return (
    <div className="mb-4 relative">
      {contextMenuOpen && (
        <div
          ref={contextMenuRef}
          className="absolute z-50 bg-neutral-800 rounded-md shadow-lg py-1 w-48"
          style={{
            top: `${contextMenuPosition.y}px`,
            left: `${contextMenuPosition.x}px`,
            transform: 'translate(-90%, -50%)'
          }}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-neutral-700 flex items-center"
            onClick={() => {
              onPinContact && onPinContact(activeContactId);
              setContextMenuOpen(false);
            }}
          >
            <FiStar className="mr-2 text-yellow-400" />
            {contacts.find(c => c.id === activeContactId)?.isPinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-neutral-700 flex items-center"
            onClick={() => {
              onMuteContact && onMuteContact(activeContactId);
              setContextMenuOpen(false);
            }}
          >
            <FiVolumeX className="mr-2 text-gray-400" />
            {contacts.find(c => c.id === activeContactId)?.isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-neutral-700 flex items-center"
            onClick={() => {
              onArchiveContact && onArchiveContact(activeContactId);
              setContextMenuOpen(false);
            }}
          >
            <FiArchive className="mr-2 text-amber-500" />
            {contacts.find(c => c.id === activeContactId)?.isArchived ? 'Unarchive' : 'Archive'}
          </button>
        </div>
      )}
      <div
        className="flex items-center justify-between px-2 py-2 cursor-pointer hover:bg-neutral-800 rounded-md transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <div className="w-6 h-6 flex items-center justify-center mr-2">
            {getIcon()}
          </div>
          <h3 className="text-sm font-medium text-white">
            {getCategoryDisplayName(category)}
            <span className="ml-2 text-xs text-gray-400">({contacts.length})</span>
          </h3>
        </div>
        <div className="text-gray-400">
          {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-1 space-y-1 pl-2">
          {contacts.map(contact => (
            <div
              key={contact.id}
              className={`flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                selectedContactId === contact.id
                  ? 'bg-[#0088cc] bg-opacity-20 border-l-4 border-[#0088cc]'
                  : 'hover:bg-neutral-800 border-l-4 border-transparent'
              }`}
              onClick={() => onContactSelect(contact)}
              onContextMenu={(e) => handleContextMenu(e, contact)}
            >
              <div className="relative ml-2">
                {contact.avatar ? (
                  <img
                    src={contact.avatar}
                    alt={contact.name}
                    className={`w-12 h-12 rounded-full object-cover transition-all duration-200 ${
                      selectedContactId === contact.id ? 'ring-2 ring-[#0088cc]' : ''
                    }`}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=0088cc&color=fff`;
                    }}
                  />
                ) : (
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                    selectedContactId === contact.id
                      ? 'bg-[#0088cc]'
                      : 'bg-gray-700 hover:bg-[#0088cc] hover:bg-opacity-70'
                  }`}>
                    {contact.isGroup ? (
                      <FiUsers className="text-white text-lg" />
                    ) : (
                      <span className="text-white text-lg font-medium">
                        {contact.telegramContact?.firstName?.charAt(0) || contact.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                )}

                {contact.unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                    {contact.unreadCount > 9 ? '9+' : contact.unreadCount}
                  </div>
                )}

                {contact.isPinned && (
                  <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                    <FiStar className="w-3 h-3" />
                  </div>
                )}

                {contact.isMuted && (
                  <div className="absolute -bottom-1 -right-1 bg-gray-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                    <FiVolumeX className="w-3 h-3" />
                  </div>
                )}
              </div>

              <div className="ml-3 flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium truncate text-white">
                    {contact.telegramContact?.firstName || contact.name}
                    {contact.telegramContact?.lastName && ` ${contact.telegramContact.lastName}`}
                  </h3>
                  {contact.timestamp && (
                    <span className="text-xs text-gray-400">
                      {new Date(contact.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <div className="flex items-center">
                  {contact.telegramContact?.username && (
                    <span className="text-[#0088cc] text-xs mr-2">@{contact.telegramContact.username}</span>
                  )}
                  <p className="text-sm truncate text-gray-400">
                    {contact.lastMessage || (contact.isGroup ? `${contact.members} members` : 'No messages yet')}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContactCategory;
