import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import api from '../utils/api'; // Import the API utility

/**
 * Component to display a contact's avatar with fallback to initials when no avatar is available
 */
const ContactAvatar = ({ contact, size = 40 }) => {
  const [loadingState, setLoadingState] = useState('loading');
  const [mediaId, setMediaId] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  
  const containerStyle = {
    width: `${size}px`,
    height: `${size}px`,
    fontSize: `${size / 2.5}px`
  };
  
  // Extract media ID from Matrix MXC URLs or full URLs
  useEffect(() => {
    if (!contact?.avatar_url) {
      setLoadingState('error');
      return;
    }
    
    const avatarUrl = contact.avatar_url;
    
    // Extract media ID
    let extractedId = null;
    
    // Handle mxc:// URLs
    if (avatarUrl.startsWith('mxc://')) {
      const matches = avatarUrl.match(/mxc:\/\/[^/]+\/([^?]+)/);
      extractedId = matches ? matches[1] : null;
    }
    // Handle thumbnail URLs
    else if (avatarUrl.includes('/thumbnail/')) {
      const matches = avatarUrl.match(/\/thumbnail\/[^/]+\/([^?]+)/);
      extractedId = matches ? matches[1] : null;
    }
    
    if (extractedId) {
      setMediaId(extractedId);
      
      // Use the API utility to get the full URL with proper auth
      const url = `/api/v1/media/avatar/${extractedId}?width=${size}&height=${size}`;
      
      // Use api.getImageUrl or similar if it exists, otherwise use a raw fetch
      // with the api utility to get the blob and create an object URL
      fetchAvatar(url, extractedId);
    } else {
      setLoadingState('error');
    }
  }, [contact?.avatar_url, size]);
  
  // Fetch avatar using the API utility
  const fetchAvatar = async (url, id) => {
    try {
      // The api utility should handle auth tokens for us
      const response = await api.get(url, {
        responseType: 'blob',
        // Any other options needed
      });
      
      // Create blob URL
      const blob = new Blob([response.data], { type: response.headers['content-type'] });
      const objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
      setLoadingState('loaded');
    } catch (error) {
      console.error(`Error fetching avatar for ${id}:`, error);
      setLoadingState('error');
    }
  };
  
  // Clean up blob URLs on unmount or when they change
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);
  
  // If no avatar or error occurred, show initials
  if (!mediaId || loadingState === 'error') {
    return (
      <div 
        className="rounded-full bg-purple-600 flex items-center justify-center text-white font-medium"
        style={containerStyle}
      >
        {contact?.display_name?.[0]?.toUpperCase() || '?'}
      </div>
    );
  }
  
  // Show loading placeholder while fetching
  if (loadingState === 'loading') {
    return (
      <div 
        className="rounded-full bg-gray-700 flex items-center justify-center animate-pulse"
        style={containerStyle}
      >
        <span className="text-xs text-gray-300">...</span>
      </div>
    );
  }
  
  // Show the image with fallback handling
  return (
    <img
      src={imageUrl}
      alt={contact?.display_name || 'Contact'}
      className="rounded-full object-cover"
      style={containerStyle}
      onError={() => setLoadingState('error')}
      loading="lazy"
    />
  );
};

ContactAvatar.propTypes = {
  contact: PropTypes.object.isRequired,
  size: PropTypes.number
};

export default ContactAvatar; 