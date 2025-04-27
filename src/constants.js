/**
 * Application-wide constants - excluded .env.prod and dev from pushing
 */

// API endpoints
export const API_BASE_URL = 'https://dailyfix-apigate.duckdns.org';
export const WHATSAPP_API_PREFIX = '/api/v1/whatsapp';
export const TELEGRAM_API_PREFIX = '/api/v1/telegram';
export const MATRIX_API_PREFIX = '/api/v1/matrix';

// Matrix constants
export const MATRIX_HOMESERVER_URL = 'https://dfix-hsbridge.duckdns.org';
export const MATRIX_TELEGRAM_BOT_ID = '@telegrambot:dfix-hsbridge.duckdns.org';
export const MATRIX_CREDENTIALS_KEY = 'matrix_credentials';

// Local storage keys
export const THEME_KEY = 'dailyfix_theme';
export const AUTH_TOKEN_KEY = 'dailyfix_auth_token';
export const USER_SETTINGS_KEY = 'dailyfix_user_settings';

// Platforms
export const PLATFORMS = {
  WHATSAPP: 'whatsapp',
  TELEGRAM: 'telegram',
  MATRIX: 'matrix'
};

// Message types
export const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
  LOCATION: 'location',
  CONTACT: 'contact',
  STICKER: 'sticker',
  SYSTEM: 'system'
};

// Contact types
export const CONTACT_TYPES = {
  INDIVIDUAL: 'individual',
  GROUP: 'group',
  CHANNEL: 'channel'
};

// Error types
export const ERROR_TYPES = {
  NETWORK: 'network',
  AUTH: 'auth',
  VALIDATION: 'validation',
  SERVER: 'server',
  UNKNOWN: 'unknown'
};

// Timeouts
export const TIMEOUTS = {
  API_REQUEST: 30000, // 30 seconds
  SYNC: 60000, // 1 minute
  TOKEN_REFRESH: 10000 // 10 seconds
};

// Pagination
export const PAGINATION = {
  MESSAGES_PER_PAGE: 50,
  CONTACTS_PER_PAGE: 50
};

// Animation durations
export const ANIMATION_DURATION = {
  SHORT: 150,
  MEDIUM: 300,
  LONG: 500
};

// Default settings
export const DEFAULT_SETTINGS = {
  theme: 'dark',
  notifications: true,
  sounds: true,
  messagePreview: true,
  autoDownload: {
    images: true,
    videos: false,
    audio: true,
    documents: false
  }
};

// Regex patterns
export const REGEX = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE: /^\+?[0-9]{10,15}$/,
  URL: /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/
};
