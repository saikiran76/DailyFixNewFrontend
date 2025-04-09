import { create } from 'zustand';

export const PROGRESS_TYPES = {
  CONNECTION: 'connection',
  CONTACTS: 'contacts',
  MESSAGES: 'messages',
  SYNC: 'sync'
};

const createProgressStore = () => create((set, get) => ({
  progress: new Map(),
  errors: new Map(),
  
  setProgress: (userId, type, value, total = 100) => {
    set(state => {
      const newProgress = new Map(state.progress);
      newProgress.set(`${userId}:${type}`, {
        value,
        total,
        percentage: Math.round((value / total) * 100),
        timestamp: Date.now()
      });
      return { progress: newProgress };
    });
  },

  setError: (userId, type, error) => {
    set(state => {
      const newErrors = new Map(state.errors);
      newErrors.set(`${userId}:${type}`, {
        message: error.message,
        timestamp: Date.now()
      });
      return { errors: newErrors };
    });
  },

  clearProgress: (userId, type) => {
    set(state => {
      const newProgress = new Map(state.progress);
      const newErrors = new Map(state.errors);
      
      if (type) {
        newProgress.delete(`${userId}:${type}`);
        newErrors.delete(`${userId}:${type}`);
      } else {
        // Clear all progress for user
        for (const key of newProgress.keys()) {
          if (key.startsWith(`${userId}:`)) {
            newProgress.delete(key);
          }
        }
        for (const key of newErrors.keys()) {
          if (key.startsWith(`${userId}:`)) {
            newErrors.delete(key);
          }
        }
      }
      
      return { progress: newProgress, errors: newErrors };
    });
  },

  getProgress: (userId, type) => {
    return get().progress.get(`${userId}:${type}`);
  },

  getError: (userId, type) => {
    return get().errors.get(`${userId}:${type}`);
  },

  getAllProgress: (userId) => {
    const result = {};
    for (const [key, value] of get().progress.entries()) {
      if (key.startsWith(`${userId}:`)) {
        const [, type] = key.split(':');
        result[type] = value;
      }
    }
    return result;
  }
}));

export const useProgress = createProgressStore();

export function useProgressTracker(userId) {
  const {
    setProgress,
    setError,
    clearProgress,
    getProgress,
    getError,
    getAllProgress
  } = useProgress();

  const trackProgress = async (type, operation, total = 100) => {
    clearProgress(userId, type);
    try {
      let lastUpdate = 0;
      const updateThrottle = 100; // ms

      const updateProgress = (value) => {
        const now = Date.now();
        if (now - lastUpdate >= updateThrottle) {
          setProgress(userId, type, value, total);
          lastUpdate = now;
        }
      };

      await operation(updateProgress);
    } catch (error) {
      setError(userId, type, error);
      throw error;
    }
  };

  return {
    trackProgress,
    getProgress: (type) => getProgress(userId, type),
    getError: (type) => getError(userId, type),
    getAllProgress: () => getAllProgress(userId),
    clearProgress: (type) => clearProgress(userId, type)
  };
} 