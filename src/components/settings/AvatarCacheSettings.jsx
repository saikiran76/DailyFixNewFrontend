import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent, 
  CircularProgress,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  Stack
} from '@mui/material';
import { useSelector } from 'react-redux';
import avatarCacheService from '../../services/AvatarCacheService';
import { prefetchAllAvatars, clearAllAvatars, getAvatarCacheStats } from '../../utils/avatarPrefetcher';

const AvatarCacheSettings = () => {
  const [cacheStats, setCacheStats] = useState({ size: 0, sizeFormatted: '0 Bytes' });
  const [loading, setLoading] = useState(false);
  const [prefetchStatus, setPrefetchStatus] = useState(null);
  const [enableCache, setEnableCache] = useState(true);
  const userId = useSelector(state => state.auth.user?.id);
  
  useEffect(() => {
    // Load cache settings from localStorage
    const savedSetting = localStorage.getItem('avatarCacheEnabled');
    if (savedSetting !== null) {
      setEnableCache(savedSetting === 'true');
    }
    
    // Load cache stats
    updateCacheStats();
  }, []);
  
  const updateCacheStats = async () => {
    try {
      const stats = await getAvatarCacheStats();
      setCacheStats(stats);
    } catch (error) {
      console.error('Error getting cache stats:', error);
    }
  };
  
  const handlePrefetchAvatars = async () => {
    try {
      setLoading(true);
      setPrefetchStatus({ status: 'loading', message: 'Prefetching avatars...' });
      
      const result = await prefetchAllAvatars();
      
      setPrefetchStatus({ 
        status: 'success', 
        message: `Prefetch complete: ${result.prefetchedCount} new avatars cached, ${result.cachedCount} already cached, ${result.errorCount} errors` 
      });
      
      // Update cache stats
      updateCacheStats();
    } catch (error) {
      console.error('Error prefetching avatars:', error);
      setPrefetchStatus({ status: 'error', message: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };
  
  const handleClearCache = async () => {
    try {
      setLoading(true);
      setPrefetchStatus({ status: 'loading', message: 'Clearing avatar cache...' });
      
      await clearAllAvatars();
      
      setPrefetchStatus({ status: 'success', message: 'Avatar cache cleared successfully' });
      
      // Update cache stats
      updateCacheStats();
    } catch (error) {
      console.error('Error clearing avatar cache:', error);
      setPrefetchStatus({ status: 'error', message: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };
  
  const handleToggleCache = (event) => {
    const newValue = event.target.checked;
    setEnableCache(newValue);
    localStorage.setItem('avatarCacheEnabled', newValue.toString());
    
    // If disabling cache, offer to clear it
    if (!newValue) {
      setPrefetchStatus({ 
        status: 'info', 
        message: 'Cache disabled. You may want to clear the existing cache to free up storage space.' 
      });
    } else {
      setPrefetchStatus({ 
        status: 'info', 
        message: 'Cache enabled. Avatars will be stored locally for faster loading.' 
      });
    }
  };
  
  if (!userId) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body1">Please log in to manage avatar cache settings.</Typography>
      </Box>
    );
  }
  
  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Avatar Cache Settings
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        <FormControlLabel
          control={
            <Switch
              checked={enableCache}
              onChange={handleToggleCache}
              color="primary"
            />
          }
          label="Enable avatar caching"
        />
        
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          When enabled, contact avatars are stored in your browser for faster loading and offline access.
        </Typography>
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">
            Current cache size: <strong>{cacheStats.sizeFormatted}</strong>
          </Typography>
        </Box>
        
        {prefetchStatus && (
          <Alert 
            severity={prefetchStatus.status === 'loading' ? 'info' : prefetchStatus.status} 
            sx={{ mb: 2 }}
          >
            {prefetchStatus.message}
          </Alert>
        )}
        
        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            color="primary"
            onClick={handlePrefetchAvatars}
            disabled={loading || !enableCache}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            Prefetch All Avatars
          </Button>
          
          <Button
            variant="outlined"
            color="error"
            onClick={handleClearCache}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            Clear Cache
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default AvatarCacheSettings;
