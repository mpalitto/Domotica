/*
Author: Matteo Palitto
Date: January 9, 2024

Description: requestHandler.mjs
Simplified orchestration layer for HTTP and WebSocket request handling
*/

import { HttpHandler } from './httpHandler.mjs';
import { WebSocketHandler } from './webSocketHandler.mjs';
import { StatusMonitor } from './statusMonitor.mjs';
import { LoggingService } from './loggingService.mjs';
import { DeviceTracking } from './deviceTracking.mjs';

// Start status monitoring on module load
StatusMonitor.start();

/**
 * Handle HTTP requests
 */
export function handleHttpRequest(req, res) {
    return HttpHandler.handleHttpRequest(req, res);
}

/**
 * Handle WebSocket connections
 */
export async function handleWebSocketConnection(ws, req) {
    return await WebSocketHandler.handleConnection(ws, req);
}

/**
 * Handle duplicate WebSocket connections
 */
export function handleDuplicateConnection(deviceID, newWs, newIP) {
    return WebSocketHandler.handleDuplicateConnection(deviceID, newWs, newIP);
}

// Export specific functions that are used in other modules (for backward compatibility)
export const debugLog = LoggingService.debugLog.bind(LoggingService);
export const initDeviceStats = DeviceTracking.initStats.bind(DeviceTracking);
export const initDeviceDiagnostics = DeviceTracking.initDiagnostics.bind(DeviceTracking);
export const markWebSocketSuccess = DeviceTracking.markWebSocketSuccess.bind(DeviceTracking);

// Re-export service classes for advanced usage
export { LoggingService } from './loggingService.mjs';
export { DeviceTracking } from './deviceTracking.mjs';
export { DeviceIdentification } from './deviceIdentification.mjs';
export { StatusMonitor } from './statusMonitor.mjs';
