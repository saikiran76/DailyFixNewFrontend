/**
 * Contact Organizer Utility
 * 
 * This utility provides functions to organize contacts into categories
 * based on their nature and user interaction level.
 */

import logger from './logger';

/**
 * Contact Categories
 */
export const ContactCategories = {
  PRIORITY: 'priority',
  UNREAD: 'unread',
  MENTIONS: 'mentions',
  DIRECT_MESSAGES: 'direct_messages',
  GROUPS: 'groups',
  CHANNELS: 'channels',
  MUTED: 'muted',
  ARCHIVED: 'archived',
};

/**
 * Organize contacts into categories
 * @param {Array} contacts - Array of contact objects
 * @param {Object} options - Organization options
 * @returns {Object} Organized contacts by category
 */
export const organizeContacts = (contacts, options = {}) => {
  if (!contacts || !Array.isArray(contacts)) {
    logger.warn('[ContactOrganizer] Invalid contacts array');
    return {};
  }

  const {
    pinnedContactIds = [],
    mutedContactIds = [],
    archivedContactIds = [],
    mentionKeywords = ['@me', '@all'],
    showMuted = true,
    showArchived = false,
  } = options;

  // Initialize categories
  const organizedContacts = {
    [ContactCategories.PRIORITY]: [],
    [ContactCategories.UNREAD]: [],
    [ContactCategories.MENTIONS]: [],
    [ContactCategories.DIRECT_MESSAGES]: [],
    [ContactCategories.GROUPS]: [],
    [ContactCategories.CHANNELS]: [],
    [ContactCategories.MUTED]: [],
    [ContactCategories.ARCHIVED]: [],
  };

  // Process each contact
  contacts.forEach(contact => {
    // Skip if contact is archived and we're not showing archived
    if (archivedContactIds.includes(contact.id) && !showArchived) {
      return;
    }

    // Skip if contact is muted and we're not showing muted
    if (mutedContactIds.includes(contact.id) && !showMuted) {
      return;
    }

    // Add metadata to contact
    const enhancedContact = {
      ...contact,
      isPinned: pinnedContactIds.includes(contact.id),
      isMuted: mutedContactIds.includes(contact.id),
      isArchived: archivedContactIds.includes(contact.id),
    };

    // Categorize contact
    if (enhancedContact.isArchived) {
      organizedContacts[ContactCategories.ARCHIVED].push(enhancedContact);
      return;
    }

    if (enhancedContact.isMuted) {
      organizedContacts[ContactCategories.MUTED].push(enhancedContact);
      return;
    }

    // Check if contact is pinned (Priority Hub)
    if (enhancedContact.isPinned) {
      organizedContacts[ContactCategories.PRIORITY].push(enhancedContact);
      return;
    }

    // Check if contact has unread messages
    if (enhancedContact.unreadCount > 0) {
      organizedContacts[ContactCategories.UNREAD].push(enhancedContact);
      
      // Check if contact has mentions
      const hasMention = mentionKeywords.some(keyword => 
        enhancedContact.lastMessage && enhancedContact.lastMessage.includes(keyword)
      );
      
      if (hasMention) {
        organizedContacts[ContactCategories.MENTIONS].push(enhancedContact);
      }
      
      return;
    }

    // Categorize by type
    if (enhancedContact.isGroup) {
      if (enhancedContact.isChannel || enhancedContact.members > 50) {
        organizedContacts[ContactCategories.CHANNELS].push(enhancedContact);
      } else {
        organizedContacts[ContactCategories.GROUPS].push(enhancedContact);
      }
    } else {
      organizedContacts[ContactCategories.DIRECT_MESSAGES].push(enhancedContact);
    }
  });

  // Sort each category
  Object.keys(organizedContacts).forEach(category => {
    organizedContacts[category] = sortContacts(organizedContacts[category]);
  });

  return organizedContacts;
};

/**
 * Sort contacts by timestamp (most recent first)
 * @param {Array} contacts - Array of contact objects
 * @returns {Array} Sorted contacts
 */
export const sortContacts = (contacts) => {
  return [...contacts].sort((a, b) => {
    // First sort by pinned status
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    // Then sort by unread count
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
    if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
    
    // Then sort by timestamp (most recent first)
    return (b.timestamp || 0) - (a.timestamp || 0);
  });
};

/**
 * Get category display name
 * @param {string} category - Category key
 * @returns {string} Display name
 */
export const getCategoryDisplayName = (category) => {
  const displayNames = {
    [ContactCategories.PRIORITY]: 'Priority Hub',
    [ContactCategories.UNREAD]: 'Unread',
    [ContactCategories.MENTIONS]: 'Mentions',
    [ContactCategories.DIRECT_MESSAGES]: 'Direct Messages',
    [ContactCategories.GROUPS]: 'Groups',
    [ContactCategories.CHANNELS]: 'Channels',
    [ContactCategories.MUTED]: 'Muted',
    [ContactCategories.ARCHIVED]: 'Archived',
  };
  
  return displayNames[category] || category;
};

/**
 * Get category icon name
 * @param {string} category - Category key
 * @returns {string} Icon name
 */
export const getCategoryIcon = (category) => {
  const icons = {
    [ContactCategories.PRIORITY]: 'star',
    [ContactCategories.UNREAD]: 'message-circle',
    [ContactCategories.MENTIONS]: 'at-sign',
    [ContactCategories.DIRECT_MESSAGES]: 'user',
    [ContactCategories.GROUPS]: 'users',
    [ContactCategories.CHANNELS]: 'hash',
    [ContactCategories.MUTED]: 'volume-x',
    [ContactCategories.ARCHIVED]: 'archive',
  };
  
  return icons[category] || 'circle';
};

export default {
  organizeContacts,
  sortContacts,
  getCategoryDisplayName,
  getCategoryIcon,
  ContactCategories,
};
