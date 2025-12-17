/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudHandler.mjs
Simplified orchestration layer for cloud connections

cloudConfig.mjs            - Configuration constants
cloudLogger.mjs            - Logging functionality
cloudHeartbeat.mjs         - Heartbeat/query message management
cloudRegistration.mjs      - Registration timeout and message building
cloudDispatch.mjs          - Cloud server discovery
cloudMessageHandler.mjs    - Message processing logic
cloudWebSocket.mjs         - WebSocket connection and event handling
cloudConnectionManager.mjs - High-level connection management
cloudHandler.mjs           - Simplified public API (orchestrator)

*/

import { CloudConnectionManager } from './cloudConnectionManager.mjs';

export const cloudHandler = {
    /**
     * Initiate cloud connection for device
     */
    connect: function(deviceID) {
        return CloudConnectionManager.connect(deviceID);
    },

    /**
     * Forward message to cloud
     */
    forward2cloud: function(deviceID, message) {
        return CloudConnectionManager.forward2cloud(deviceID, message);
    },

    /**
     * Close cloud connection
     */
    closeConnection: function(deviceID) {
        return CloudConnectionManager.closeConnection(deviceID);
    }
};

// Export individual classes for advanced usage
export { CloudLogger } from './cloudLogger.mjs';
export { CloudHeartbeat } from './cloudHeartbeat.mjs';
export { CloudRegistration } from './cloudRegistration.mjs';
export { CloudDispatch } from './cloudDispatch.mjs';
export { CloudMessageHandler } from './cloudMessageHandler.mjs';
export { CloudWebSocket } from './cloudWebSocket.mjs';
export { CloudConnectionManager } from './cloudConnectionManager.mjs';
export { CLOUD_CONFIG } from './cloudConfig.mjs';
