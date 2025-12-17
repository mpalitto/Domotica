/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudConfig.mjs
Configuration constants for cloud connections
*/

export const CLOUD_CONFIG = {
    // Cloud heartbeat interval (eWeLink requires query every ~145s, we use 120s for safety)
    HEARTBEAT_INTERVAL_MS: 120000,
    
    // Registration timeout
    REGISTRATION_TIMEOUT_MS: 30000,
    
    // Reconnection delays
    RECONNECT_BASE_DELAY_MS: 5000,
    RECONNECT_MAX_DELAY_MS: 60000,
    MAX_RECONNECT_ATTEMPTS: 5,
    
    // Dispatch configuration
    DISPATCH_URL: 'https://eu-disp.coolkit.cc/dispatch/device',
    DISPATCH_HOSTNAME: 'eu-disp.coolkit.cc',
    
    // Request timeout
    HTTPS_TIMEOUT_MS: 10000,
    
    // Device model info
    DEFAULT_MODEL: 'ITA-GZ1-GL',
    DEFAULT_ROM_VERSION: '3.5.0',
    DEFAULT_VERSION: 8,
    
    // Logging
    SHOW_HEARTBEAT_EVERY: 100  // Show heartbeat every N messages (0 = never, 1 = always)
};
