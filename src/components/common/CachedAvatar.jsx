import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import avatarCacheService from '../../services/AvatarCacheService';
import { CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';

const AvatarContainer = styled('div')(({ theme, size }) => ({
  width: size,
  height: size,
  borderRadius: '50%',
  overflow: 'hidden',
  backgroundColor: theme.palette.grey[300],
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
}));

const AvatarImage = styled('img')({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

const AvatarFallback = styled('div')(({ theme, size, seed }) => {
  // Generate a deterministic color based on the seed
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360;
  const backgroundColor = `hsl(${hue}, 70%, 60%)`;
  
  return {
    width: '100%',
    height: '100%',
    backgroundColor,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: theme.palette.common.white,
    fontSize: size / 2,
    fontWeight: 'bold',
  };
});

/**
 * CachedAvatar component that displays an avatar image with IndexedDB caching
 */
const CachedAvatar = ({ 
  contactId, 
  mediaId, 
  size = 40, 
  fallbackText = '?',
  showLoading = true,
  onLoad = () => {},
  onError = () => {}
}) => {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const userId = useSelector(state => state.auth.user?.id);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  useEffect(() => {
    let isMounted = true;
    
    const fetchAvatar = async () => {
      if (!userId || !contactId || !mediaId) {
        setLoading(false);
        setError(true);
        return;
      }
      
      try {
        setLoading(true);
        setError(false);
        
        // Try to get the avatar from IndexedDB cache first
        const cachedAvatar = await avatarCacheService.getAvatar(userId, contactId, mediaId);
        
        if (cachedAvatar && cachedAvatar.blob) {
          // Create a URL for the cached blob
          const objectUrl = URL.createObjectURL(cachedAvatar.blob);
          
          if (isMounted) {
            setAvatarUrl(objectUrl);
            setLoading(false);
            onLoad(objectUrl);
          }
          
          return;
        }
        
        // If not in cache, fetch from API
        const avatarEndpoint = `${apiUrl}/api/v1/media/avatar/${mediaId}?width=${size}&height=${size}`;
        
        const response = await fetch(avatarEndpoint, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch avatar: ${response.status} ${response.statusText}`);
        }
        
        // Get the blob and content type
        const blob = await response.blob();
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        
        // Store in IndexedDB cache
        await avatarCacheService.storeAvatar(userId, contactId, mediaId, blob, contentType);
        
        // Create a URL for the blob
        const objectUrl = URL.createObjectURL(blob);
        
        if (isMounted) {
          setAvatarUrl(objectUrl);
          setLoading(false);
          onLoad(objectUrl);
        }
      } catch (err) {
        console.error('Error fetching avatar:', err);
        
        if (isMounted) {
          setLoading(false);
          setError(true);
          onError(err);
        }
      }
    };
    
    fetchAvatar();
    
    // Clean up function
    return () => {
      isMounted = false;
      // Revoke object URL to prevent memory leaks
      if (avatarUrl) {
        URL.revokeObjectURL(avatarUrl);
      }
    };
  }, [userId, contactId, mediaId, size, apiUrl, onLoad, onError]);
  
  if (loading && showLoading) {
    return (
      <AvatarContainer size={size}>
        <CircularProgress size={size / 2} />
      </AvatarContainer>
    );
  }
  
  if (error || !avatarUrl) {
    return (
      <AvatarContainer size={size}>
        <AvatarFallback size={size} seed={contactId || mediaId || 'default'}>
          {fallbackText.charAt(0).toUpperCase()}
        </AvatarFallback>
      </AvatarContainer>
    );
  }
  
  return (
    <AvatarContainer size={size}>
      <AvatarImage src={avatarUrl} alt="Avatar" />
    </AvatarContainer>
  );
};

CachedAvatar.propTypes = {
  contactId: PropTypes.string.isRequired,
  mediaId: PropTypes.string.isRequired,
  size: PropTypes.number,
  fallbackText: PropTypes.string,
  showLoading: PropTypes.bool,
  onLoad: PropTypes.func,
  onError: PropTypes.func,
};

export default CachedAvatar;
