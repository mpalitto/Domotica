/*
Author: Matteo Palitto
Date: January 9, 2024

Description: config.mjs
Configuration constants for the proxy server
*/

export const WEBSOCKET_CONFIG = {
    IDENTIFICATION_TIMEOUT: 120000, // 120 seconds
    PING_TIMEOUT: 180000, // 180 seconds (devices ping every ~140s)
    PING_CHECK_INTERVAL: 300000, // Check every 300 seconds
    FIRST_MESSAGE_TIMEOUT: 300000, // 300 seconds
    RECONNECTION_CHECK_DELAY: 5000, // 5 seconds
};

export const DIAGNOSTIC_CONFIG = {
    MAX_ENTRIES: 20,
    MAX_ERROR_ENTRIES: 10,
    DISPATCH_IP_MATCH_WINDOW: 60, // seconds
};

export const LOGGING_CONFIG = {
    VERBOSE: false, // Set to true to see all pings/heartbeats
    SHOW_ROUTINE_PINGS: false, // Show pings from identified devices
    SHOW_PREID_PING_EVERY: 30, // Show pre-ID pings every N pings (0 = never)
    SHOW_CLOUD_HEARTBEAT_EVERY: 100, // Show cloud heartbeats every N (0 = never)
    STATUS_SUMMARY_INTERVAL: 300000, // Show status summary every 5 minutes (0 = never)
};
