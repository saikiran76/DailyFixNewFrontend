/**
 * Utility functions for handling Matrix media
 */
import logger from './logger';

// In-memory cache for quick access
const mediaCache = new Map();

/**
 * Get a media URL with proper error handling and caching
 * @param {Object} client - Matrix client
 * @param {string} mxcUrl - mxc:// URL
 * @param {Object} options - Options for the media URL
 * @param {string} options.type - Type of media (thumbnail, download)
 * @param {number} options.width - Width for thumbnails
 * @param {number} options.height - Height for thumbnails
 * @param {string} options.method - Method for thumbnails (crop, scale)
 * @param {string} options.fallbackUrl - Fallback URL if mxcUrl is invalid
 * @returns {string} - HTTP URL for the media
 */
export const getMediaUrl = (client, mxcUrl, options = {}) => {
  if (!mxcUrl || !client) {
    return options.fallbackUrl || '';
  }

  // If not an mxc URL, return as is
  if (!mxcUrl.startsWith('mxc://')) {
    return mxcUrl;
  }

  // Create a cache key
  const cacheKey = `${mxcUrl}_${JSON.stringify(options)}`;

  // Check memory cache
  if (mediaCache.has(cacheKey)) {
    return mediaCache.get(cacheKey);
  }

  // Check localStorage cache
  try {
    const cachedUrl = localStorage.getItem(`media_cache_${cacheKey}`);
    if (cachedUrl) {
      // Add to memory cache
      mediaCache.set(cacheKey, cachedUrl);
      return cachedUrl;
    }
  } catch (error) {
    logger.warn('[mediaUtils] Error accessing localStorage cache:', error);
  }

  try {
    // Extract the server name and media ID from the mxc URL
    const [, serverName, mediaId] = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/) || [];

    if (!serverName || !mediaId) {
      logger.warn(`[mediaUtils] Invalid mxc URL: ${mxcUrl}`);
      return options.fallbackUrl || '';
    }

    // Get the access token
    const accessToken = client.getAccessToken();
    if (!accessToken) {
      logger.warn('[mediaUtils] No access token available');
      return options.fallbackUrl || '';
    }

    // Create the URL based on the type
    let url;
    const { type = 'download', width = 800, height = 600, method = 'scale' } = options;

    // Use the client/v1 endpoint which is more reliable
    if (type === 'thumbnail') {
      url = `${client.baseUrl}/_matrix/client/v1/media/thumbnail/${serverName}/${mediaId}?width=${width}&height=${height}&method=${method}&allow_redirect=true`;
    } else {
      url = `${client.baseUrl}/_matrix/client/v1/media/download/${serverName}/${mediaId}?allow_redirect=true`;
    }

    // Note: We're using the access token in the URL for simplicity
    // In a production environment, we would use a proper fetch with Authorization header

    // For direct use in img src, we'll return the URL with the access token
    // This isn't ideal, but it's the simplest solution for now
    url = `${url}&access_token=${encodeURIComponent(accessToken)}`;

    // Cache the URL
    try {
      mediaCache.set(cacheKey, url);
      localStorage.setItem(`media_cache_${cacheKey}`, url);
    } catch (error) {
      logger.warn('[mediaUtils] Error caching URL:', error);
    }

    return url;
  } catch (error) {
    logger.error('[mediaUtils] Error generating media URL:', error);
    return options.fallbackUrl || '';
  }
};

/**
 * Clear the media cache
 */
export const clearMediaCache = () => {
  // Clear memory cache
  mediaCache.clear();

  // Clear localStorage cache
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('media_cache_')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    logger.info(`[mediaUtils] Cleared ${keysToRemove.length} items from media cache`);
  } catch (error) {
    logger.error('[mediaUtils] Error clearing localStorage cache:', error);
  }
};

/**
 * Get a fallback avatar URL for a user
 * @param {string} name - User name
 * @param {string} color - Background color
 * @returns {string} - Data URL for the avatar
 */
export const getFallbackAvatarUrl = (name = '?', color = '#0088cc') => {
  const initial = name.charAt(0).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <rect width="40" height="40" fill="${color}" rx="20" ry="20"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="20" fill="white" text-anchor="middle" dominant-baseline="central">${initial}</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

export default {
  getMediaUrl,
  clearMediaCache,
  getFallbackAvatarUrl
};
