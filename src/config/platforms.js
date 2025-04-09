export const PLATFORM_CONFIGS = {
  whatsapp: {
    name: 'WhatsApp',
    icon: '📱',
    connectionType: 'QR_CODE',
    requiresQR: true,
    requiresToken: false,
    requiresOAuth: false
  },
  telegram: {
    name: 'Telegram',
    icon: '✈️',
    connectionType: 'BOT_TOKEN',
    requiresQR: false,
    requiresToken: true,
    requiresOAuth: false
  },
  slack: {
    name: 'Slack',
    icon: '💬',
    connectionType: 'OAUTH',
    requiresQR: false,
    requiresToken: false,
    requiresOAuth: true
  },
  discord: {
    name: 'Discord',
    icon: '🎮',
    connectionType: 'OAUTH',
    requiresQR: false,
    requiresToken: false,
    requiresOAuth: true
  }
}; 