/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudConfig.mjs
Configuration constants for cloud connections
*/

export const CLOUD_CONFIG = {
    // The cloud requires an application-level message (action: 'query')
    // to be sent roughly every 145 seconds. We use 10 seconds as a safe margin.
    HEARTBEAT_INTERVAL_MS: 10000,
    
    // Registration timeout - if we don't get a response in 30s, consider it failed
    REGISTRATION_TIMEOUT_MS: 30000,
    
    // Base delay for reconnection attempts
    RECONNECT_BASE_DELAY_MS: 5000,
    
    // Maximum delay for reconnection attempts
    RECONNECT_MAX_DELAY_MS: 60000,
    
    // Maximum reconnection attempts before giving up
    MAX_RECONNECT_ATTEMPTS: 5,
    
    // Dispatch URL
    DISPATCH_URL: 'https://eu-disp.coolkit.cc/dispatch/device',
    DISPATCH_HOSTNAME: 'eu-disp.coolkit.cc',
    
    // Request timeout
    HTTPS_TIMEOUT_MS: 10000,
    
    // Device model info for registration
    DEFAULT_MODEL: 'ITA-GZ1-GL',
    DEFAULT_ROM_VERSION: '3.5.0',
    DEFAULT_VERSION: 8
};
