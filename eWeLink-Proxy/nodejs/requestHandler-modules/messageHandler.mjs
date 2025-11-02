/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: messageHandler.mjs
Handles WebSocket messages from devices and coordinates with cloud
Supports transparent capture mode for protocol analysis

Key features:
- Uses device's own apikey (not proxyAPIKey) for responses
- Supports transparent capture mode with IP-based matching
- Clears timeouts after successful registration
- Properly handles cloud connection events
*/

import { sONOFF, proxyEvent, proxyAPIKey, deviceStats, deviceDiagnostics, transparentMode } from '../sharedVARs.js';
import { initDeviceStats, initDeviceDiagnostics, debugLog, markWebSocketSuccess, handleDuplicateConnection } from './requestHandler.mjs';
import { updateDeviceInCmdFile, getDeviceFromCmdFile } from '../cmd-modules/cmdFileManager.mjs';
import { TransparentMode } from '../transparentMode-modules/transparentMode.mjs';

// Internal message handling logic
const messageHandlerInternal = {
    actions: {},
    connectionid: {},

    setWebSocket: function (webSocket, deviceIP) {
        this.connectionid[deviceIP] = { ws: webSocket, msg: '' };
    },

    on: function (action, actionHandler) {
        this.actions[action] = actionHandler;
    },

    handleAction: function (action, ws) {
        const actionHandler = this.actions[action] || this.actions.defaultAction;
        actionHandler(ws);
    },

    defaultAction: function () {
        console.log('⚠️  Unexpected message action received');
        return 0;
    },

    msgInit: function (buffer, ws) {
        ws['msg'] = buffer.toString();

        // ========================================================================
        // TRANSPARENT MODE CHECK - MUST BE FIRST (before any processing)
        // ========================================================================
        if (transparentMode.enabled) {
            const cleanIP = ws['IP'] ? ws['IP'].replace('::ffff:', '') : null;
            
            // Check if this connection matches transparent mode criteria
            let isTransparentCapture = false;
            let deviceID = null;
            
            // Try to parse message to check deviceID
            try {
                const msgObj = JSON.parse(ws['msg']);
                deviceID = msgObj.deviceid;
                
                // Match by device ID
                if (transparentMode.deviceId && deviceID === transparentMode.deviceId) {
                    isTransparentCapture = true;
                }
            } catch (err) {
                // Can't parse - might still match by IP
                // This is OK, we'll check IP match below
            }
            
            // Match by IP (even if message can't be parsed or has no deviceid)
            if (transparentMode.matchedByIp && cleanIP === transparentMode.deviceIp) {
                isTransparentCapture = true;
            }
            
            if (isTransparentCapture) {
                // Store device IP if not already stored
                if (!transparentMode.deviceIp && cleanIP) {
                    transparentMode.deviceIp = cleanIP;
                    console.log(`🔍 Transparent: Device IP confirmed: ${cleanIP}`);
                }
                
                // **CRITICAL FIX: Set deviceid on WebSocket so timeouts know device is active**
                if (deviceID && !ws['deviceid']) {
                    ws['deviceid'] = deviceID;
                    console.log(`🔍 Transparent: WebSocket deviceid set to ${deviceID}`);
                }
                
                // Update console with device info if available
                if (deviceID && sONOFF[deviceID]) {
                    console.log(`🔍 Transparent: Device alias: ${sONOFF[deviceID].alias || 'N/A'}`);
                }
                
                // Handle in transparent mode (just forward, don't process)
                TransparentMode.handleDeviceMessage(ws, ws['msg'], ws['IP']);
                
                // IMPORTANT: Return early, skip ALL normal processing
                return deviceID || 'TRANSPARENT';
            }
        }
        
        // ========================================================================
        // NORMAL MODE - Regular proxy processing
        // ========================================================================

        try {
            let msgObj = JSON.parse(ws['msg']);
            
            // Extract deviceid from ANY message
            if (!ws['deviceid'] && msgObj['deviceid']) {
                ws['deviceid'] = msgObj['deviceid'];
                console.log(`📱 Device identified: ${ws['deviceid']} "${sONOFF[ws['deviceid']]?.alias || 'unknown'}" (${msgObj['action']})`);
            }
            
            // Initialize device object if it doesn't exist yet
            if (ws['deviceid']) {
                if (!sONOFF[ws['deviceid']]) {
                    console.log(`⚠️  Initializing device object for ${ws['deviceid']} (received ${msgObj['action']} before proper initialization)`);
                    sONOFF[ws['deviceid']] = {
                        state: 'OFFLINE',
                        isOnline: false,
                        cloudConnected: false,
                        alias: 'new-' + ws['deviceid']
                    };
                }
                
                // Ensure required properties exist
                if (typeof sONOFF[ws['deviceid']]["isOnline"] === 'undefined') {
                    sONOFF[ws['deviceid']]["isOnline"] = false;
                }
                if (typeof sONOFF[ws['deviceid']]["cloudConnected"] === 'undefined') {
                    sONOFF[ws['deviceid']]["cloudConnected"] = false;
                }
                
                // Initialize stats for this device (ensures all fields exist)
                initDeviceStats(ws['deviceid']);
                
                // Increment message counter
                deviceStats[ws['deviceid']].WEBSOCKET_MSG++;
            }
            
            // **SPECIAL HANDLING FOR REGISTER** (before general message processing)
            if (msgObj['action'] == 'register') {
                ws['deviceid'] = msgObj['deviceid'];
                
                console.log(`📋 REGISTER: ${ws['deviceid']} "${sONOFF[ws['deviceid']]?.alias || 'unknown'}"`);
                
                // **CRITICAL: Clear first message timeout - device is now registered!**
                if (ws.firstMessageTimeout) {
                    clearTimeout(ws.firstMessageTimeout);
                    ws.firstMessageTimeout = null;
                    console.log(`   ✅ Cleared first-message timeout (device registered successfully)`);
                }
                
                // **CRITICAL: Clear stale connection timeout - device has re-registered!**
                if (ws.staleConnectionTimeout) {
                    clearTimeout(ws.staleConnectionTimeout);
                    ws.staleConnectionTimeout = null;
                    console.log(`   ✅ Cleared stale-connection timeout (fresh registration received)`);
                }
                
                // Initialize stats and diagnostics
                initDeviceStats(ws['deviceid']);
                initDeviceDiagnostics(ws['deviceid']);
                
                // **CRITICAL: Mark WebSocket connection success FIRST**
                markWebSocketSuccess(ws['deviceid'], ws);
                
                // Update registration time
                deviceDiagnostics[ws['deviceid']].lastRegistrationTime = new Date().toISOString();
                
                // Calculate delay from WebSocket ATTEMPT to Registration
                if (deviceDiagnostics[ws['deviceid']].lastWebSocketAttemptTime) {
                    let wsAttemptTime = new Date(deviceDiagnostics[ws['deviceid']].lastWebSocketAttemptTime);
                    let regTime = new Date();
                    let delay = (regTime - wsAttemptTime) / 1000; // seconds
                    deviceDiagnostics[ws['deviceid']].wsToRegisterDelay = delay.toFixed(2) + 's';
                }
                
                // Debug logging
                debugLog(ws['deviceid'], 'DEVICE → PROXY', 'REGISTER REQUEST', ws['msg']);
                
                // Ensure device object exists
                if (!sONOFF[ws['deviceid']]) {
                    sONOFF[ws['deviceid']] = {};
                }
                
                // Check for duplicate connections and close old one
                handleDuplicateConnection(ws['deviceid'], ws, ws['IP']);
                
                // Store connection info
                sONOFF[ws['deviceid']]["conn"] = {};
                sONOFF[ws['deviceid']]["conn"]['apikey'] = msgObj['apikey'];
                sONOFF[ws['deviceid']]["conn"]['ws'] = ws;
                sONOFF[ws['deviceid']]["state"] = 'Registered'; // Temporary state until cloud connects
                sONOFF[ws['deviceid']]["isOnline"] = false; // Not fully online until cloud connects
                sONOFF[ws['deviceid']]["cloudConnected"] = false;
            }
            
            // Log important state changes
            if (msgObj['action'] === 'update' && msgObj.params?.switch) {
                console.log(`💡 ${ws['deviceid']} "${sONOFF[ws['deviceid']]?.alias || 'unknown'}" → ${msgObj.params.switch.toUpperCase()}`);
            }
            
            // Process device-specific logic if we have a valid deviceid
            if (ws['deviceid'] && sONOFF[ws['deviceid']]) {
                // If device is fully online (registered AND cloud connected), forward messages
                if (sONOFF[ws['deviceid']]["isOnline"]) {
                    // Debug logging for messages from online devices
                    debugLog(ws['deviceid'], 'DEVICE → PROXY', 'MESSAGE (ONLINE)', ws['msg']);
                    
                    proxyEvent.emit('messageFromDevice', ws['deviceid'], ws['msg']);
                    proxyEvent.emit('pingReceived', ws['deviceid']);
                    
                    // Update local state if it's an update message
                    if (msgObj['action'] == 'update' && msgObj['params'] && msgObj['params']['switch']) {
                        sONOFF[ws['deviceid']]['state'] = msgObj['params']['switch'];
                    }
                }
            } else if (!ws['deviceid']) {
                console.log('⚠️  Warning: Received message without deviceid');
            }
            
            // Handle error responses
            if (msgObj['error'] && msgObj['error'] !== 0 && msgObj['error'] !== '0') {
                console.log(`❌ Command error from device ${ws['deviceid']}: ${msgObj['error']}`);
                return 0;
            }
            
            // Dispatch to action handlers
            if (msgObj.action) {
                messageHandlerInternal.handleAction(msgObj.action, ws);
            }
        } catch (error) {
            console.error('❌ Error parsing message:', error.message);
            if (ws['msg']) {
                console.error('Message was:', ws['msg'].substring(0, 200));
            }
        }
        return ws['deviceid'];
    },
};

// Export wrapper function
export function handleMessage(ws, messageString, deviceIP) {
    return messageHandlerInternal.msgInit(messageString, ws);
}

// Map internal handlers to exported function
handleMessage.on = messageHandlerInternal.on.bind(messageHandlerInternal);
handleMessage.handleAction = messageHandlerInternal.handleAction.bind(messageHandlerInternal);

// ============================================================================
// ACTION HANDLERS
// ============================================================================

// **REGISTER ACTION HANDLER**
handleMessage.on('register', (ws) => {
    if (!ws['deviceid']) {
        console.error('❌ Register handler called without deviceid!');
        return;
    }
    
    // Ensure stats exist and increment
    initDeviceStats(ws['deviceid']);
    deviceStats[ws['deviceid']].REGISTER_REQ++;
    
    // **CRITICAL FIX: Extract device's ORIGINAL apikey from the register message**
    let msgObj = JSON.parse(ws['msg']);
    const deviceApiKey = msgObj['apikey'];
    
    // **Build response using the SAME apikey the device sent**
    // (Don't use proxyAPIKey - use device's own key!)
    const response = JSON.stringify({
        error: 0,
        deviceid: ws['deviceid'],
        apikey: deviceApiKey,  // ← Use device's apikey, not proxyAPIKey!
        config: { hb: 1, hbInterval: 145 }  // ← Match cloud's hbInterval (145s, not 3s)
    });
    
    // Debug logging
    debugLog(ws['deviceid'], 'PROXY → DEVICE', 'REGISTER RESPONSE', response);
    
    console.log(`   ✅ Using device's apikey: ${deviceApiKey.substring(0, 8)}...`);
    
    // Send response
    ws.send(response);
    deviceStats[ws['deviceid']].REGISTER_ACK++;
    
    // Get device from file or use new alias
    const deviceFromFile = getDeviceFromCmdFile(ws['deviceid']);
    
    if (!sONOFF[ws['deviceid']].alias || sONOFF[ws['deviceid']].alias.startsWith('new-')) {
        if (deviceFromFile && !deviceFromFile.alias.startsWith('new-')) {
            sONOFF[ws['deviceid']]["alias"] = deviceFromFile.alias;
        } else {
            sONOFF[ws['deviceid']]["alias"] = 'new-' + ws['deviceid'];
            console.log(`   🆕 New device needs a name - use: name ${ws['deviceid']} <name>`);
        }
    }
    
    // Get MAC and IP from WebSocket
    const mac = ws['MAC'] || null;
    const ip = ws['IP'] ? ws['IP'].replace('::ffff:', '') : null;
    
    // Update cmd file with current MAC and IP
    updateDeviceInCmdFile(ws['deviceid'], sONOFF[ws['deviceid']]["alias"], mac, ip);
    
    // Store registration string
    sONOFF[ws['deviceid']]['registerSTR'] = ws['msg'];
    sONOFF[ws['deviceid']]["state"] = 'off'; // Default to off until we get actual state
    
    // Initiate cloud connection
    console.log(`🌐 Connecting ${ws['deviceid']} "${sONOFF[ws['deviceid']].alias}" to cloud...`);
    proxyEvent.emit('devConnEstablished', ws['deviceid']);
});

// **DATE ACTION HANDLER**
handleMessage.on('date', (ws) => {
    if (!ws['deviceid']) {
        console.log('⚠️  Received date request without deviceid');
        return;
    }
    
    // Ensure device object exists
    if (!sONOFF[ws['deviceid']]) {
        sONOFF[ws['deviceid']] = {
            state: 'OFFLINE',
            isOnline: false,
            cloudConnected: false,
            alias: 'new-' + ws['deviceid']
        };
    }
    
    sONOFF[ws['deviceid']]['dateSTR'] = ws['msg'];
    
    // Ensure stats exist and increment
    initDeviceStats(ws['deviceid']);
    deviceStats[ws['deviceid']].DATE_REQ++;
    
    // **CRITICAL FIX: Get device's apikey from stored connection**
    // Use cloudApiKey if available (cloud may have changed it), otherwise use original
    const deviceApiKey = sONOFF[ws['deviceid']].conn?.cloudApiKey || 
                         sONOFF[ws['deviceid']].conn?.apikey || 
                         proxyAPIKey;  // Fallback only
    
    // Build response using device's apikey
    const response = JSON.stringify({
        error: 0,
        deviceid: ws['deviceid'],
        apikey: deviceApiKey,  // ← Use device's apikey
        date: new Date().toISOString()
    });
    
    // Debug logging
    debugLog(ws['deviceid'], 'DEVICE → PROXY', 'DATE REQUEST', ws['msg']);
    debugLog(ws['deviceid'], 'PROXY → DEVICE', 'DATE RESPONSE', response);
    
    // Send response
    ws.send(response);
    deviceStats[ws['deviceid']].DATE_RES++;
});

// **UPDATE ACTION HANDLER**
handleMessage.on('update', (ws) => {
    if (!ws['deviceid']) {
        console.log('⚠️  Received update without deviceid');
        return;
    }
    
    // Ensure device object exists
    if (!sONOFF[ws['deviceid']]) {
        sONOFF[ws['deviceid']] = {
            state: 'OFFLINE',
            isOnline: false,
            cloudConnected: false,
            alias: 'new-' + ws['deviceid']
        };
    }
    
    sONOFF[ws['deviceid']]['updateSTR'] = ws['msg'];
    
    // Ensure stats exist and increment
    initDeviceStats(ws['deviceid']);
    deviceStats[ws['deviceid']].UPDATE_REQ++;
    
    // Parse and update state
    let msgObj = JSON.parse(ws['msg']);
    if (msgObj['params'] && msgObj['params']['switch']) {
        sONOFF[ws['deviceid']]['state'] = msgObj['params']['switch'];
    }
    
    // **CRITICAL FIX: Get device's apikey from stored connection**
    // Use cloudApiKey if available (cloud may have changed it), otherwise use original
    const deviceApiKey = sONOFF[ws['deviceid']].conn?.cloudApiKey || 
                         sONOFF[ws['deviceid']].conn?.apikey || 
                         proxyAPIKey;  // Fallback only
    
    // Build response using device's apikey
    const response = JSON.stringify({
        error: 0,
        deviceid: ws['deviceid'],
        apikey: deviceApiKey  // ← Use device's apikey
    });
    
    // Debug logging
    debugLog(ws['deviceid'], 'DEVICE → PROXY', 'UPDATE REQUEST', ws['msg']);
    debugLog(ws['deviceid'], 'PROXY → DEVICE', 'UPDATE ACK', response);
    
    // Send response
    ws.send(response);
    deviceStats[ws['deviceid']].UPDATE_ACK++;
});

// **QUERY ACTION HANDLER**
handleMessage.on('query', (ws) => {
    if (!ws['deviceid']) {
        console.log('⚠️  Received query without deviceid');
        return;
    }
    
    // Ensure device object exists
    if (!sONOFF[ws['deviceid']]) {
        sONOFF[ws['deviceid']] = {
            state: 'OFFLINE',
            isOnline: false,
            cloudConnected: false,
            alias: 'new-' + ws['deviceid']
        };
    }
    
    sONOFF[ws['deviceid']]['querySTR'] = ws['msg'];
    
    // Ensure stats exist and increment
    initDeviceStats(ws['deviceid']);
    deviceStats[ws['deviceid']].QUERY_REQ++;
    
    // Debug logging
    debugLog(ws['deviceid'], 'DEVICE → PROXY', 'QUERY REQUEST', ws['msg']);
    
    // Note: Query typically doesn't get a direct response from proxy
    // The cloud will respond, and we'll forward that response
    deviceStats[ws['deviceid']].QUERY_RES++;
});

// ============================================================================
// CLOUD CONNECTION EVENT HANDLERS
// ============================================================================

// Event handler for when cloud connection is established
proxyEvent.on('cloudConnectionEstablished', (deviceID) => {
    if (sONOFF[deviceID]) {
        console.log(`✅ ${deviceID} "${sONOFF[deviceID].alias}" FULLY ONLINE (local + cloud)`);
        
        sONOFF[deviceID].cloudConnected = true;
        sONOFF[deviceID].isOnline = true; // NOW the device is fully online
        
        // Update diagnostics
        initDeviceDiagnostics(deviceID);
        deviceDiagnostics[deviceID].lastOnlineTime = new Date().toISOString();
    }
});

// Event handler for when cloud connection fails
proxyEvent.on('cloudConnectionFailed', (deviceID, reason) => {
    if (sONOFF[deviceID]) {
        console.log(`❌ ${deviceID} "${sONOFF[deviceID].alias}" cloud connection failed: ${reason || 'Unknown'}`);
        
        sONOFF[deviceID].cloudConnected = false;
        sONOFF[deviceID].isOnline = false; // Not fully functional without cloud
    }
});

// Event handler for when cloud connection is closed
proxyEvent.on('cloudConnectionClosed', (deviceID) => {
    if (sONOFF[deviceID]) {
        console.log(`🔌 ${deviceID} "${sONOFF[deviceID].alias}" cloud disconnected`);
        
        sONOFF[deviceID].cloudConnected = false;
        
        // If local connection is also gone, device is offline
        if (!sONOFF[deviceID].conn || !sONOFF[deviceID].conn.ws) {
            sONOFF[deviceID].isOnline = false;
            sONOFF[deviceID].state = 'OFFLINE';
        } else {
            // Local connection exists but no cloud - mark as not fully online
            sONOFF[deviceID].isOnline = false;
        }
    }
});
