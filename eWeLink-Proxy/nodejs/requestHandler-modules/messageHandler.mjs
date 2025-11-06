/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: messageHandler.mjs
Handles WebSocket messages from devices and coordinates with cloud
Supports transparent capture mode for protocol analysis

Key features:
- Uses three-state system (localConnectionState, cloudConnectionState, switchState)
- Uses device's original apikey (deviceApiKey) for cloud connection
- Uses proxyAPIKey (localApiKey) for local device responses
- Supports transparent capture mode with IP-based matching
- Clears timeouts after successful registration
- Properly handles cloud connection events
*/

import { sONOFF, proxyEvent, proxyAPIKey, deviceStats, deviceDiagnostics, transparentMode, ConnectionState, SwitchState } from '../sharedVARs.js';
import { DeviceTracking } from './deviceTracking.mjs';
import { LoggingService } from './loggingService.mjs';
import { TransparentMode } from '../transparentMode-modules/transparentMode.mjs';
import { updateDeviceInCmdFile, getDeviceFromCmdFile } from '../cmd-modules/cmdFileManager.mjs';
import { startPingMonitoring } from './webSocketHandler.mjs';

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
                
                // Set deviceid on WebSocket so timeouts know device is active
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
                DeviceTracking.initDeviceObject(ws['deviceid']);
                
                // Initialize stats for this device (ensures all fields exist)
                DeviceTracking.initStats(ws['deviceid']);
                
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
                
                // Initialize stats and diagnostics
                DeviceTracking.initStats(ws['deviceid']);
                DeviceTracking.initDiagnostics(ws['deviceid']);
                
                // **CRITICAL: Mark WebSocket connection success FIRST**
                DeviceTracking.markWebSocketSuccess(ws['deviceid'], ws);
                
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
                LoggingService.debugLog(ws['deviceid'], 'DEVICE → PROXY', 'REGISTER REQUEST', ws['msg']);
                
                // Check for duplicate connections and close old one
                this.handleDuplicateConnection(ws['deviceid'], ws, ws['IP']);
                
                // Ensure conn object exists
                if (!sONOFF[ws['deviceid']]["conn"]) {
                    sONOFF[ws['deviceid']]["conn"] = {};
                }
                
                // Store connection info (will be populated properly in REGISTER handler)
                sONOFF[ws['deviceid']]["conn"]['ws'] = ws;
                
                // Update local connection state to REGISTERED
                DeviceTracking.setLocalConnectionState(ws['deviceid'], ConnectionState.REGISTERED);
            }
            
            // Log important state changes (switch updates)
            if (msgObj['action'] === 'update' && msgObj.params?.switch) {
                const newSwitchState = msgObj.params.switch.toUpperCase();
                DeviceTracking.setSwitchState(ws['deviceid'], newSwitchState);
            }
            
            // Process device-specific logic if we have a valid deviceid
            if (ws['deviceid'] && sONOFF[ws['deviceid']]) {
                // If device is fully online (both local and cloud ONLINE), forward messages
                if (sONOFF[ws['deviceid']]["isOnline"]) {
                    // Debug logging for messages from online devices
                    LoggingService.debugLog(ws['deviceid'], 'DEVICE → PROXY', 'MESSAGE (ONLINE)', ws['msg']);
                    
                    proxyEvent.emit('messageFromDevice', ws['deviceid'], ws['msg']);
                    proxyEvent.emit('pingReceived', ws['deviceid']);
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

    /**
     * Handle duplicate connection (close old one)
     */
    handleDuplicateConnection: function(deviceID, newWs, newIP) {
        if (sONOFF[deviceID] && sONOFF[deviceID].conn && sONOFF[deviceID].conn.ws) {
            const oldWs = sONOFF[deviceID].conn.ws;
            
            // Check if old connection is still open
            if (oldWs.readyState === 1) { // OPEN
                console.log(`⚠️  Duplicate connection for ${deviceID} - closing old connection`);
                console.log(`   Old: ${oldWs.IP}, New: ${newIP}`);
                
                oldWs.close(1001, 'Replaced by new connection');
                return true;
            }
        }
        return false;
    }
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

    const deviceID = ws['deviceid'];

    // Ensure stats exist and increment
    DeviceTracking.initStats(deviceID);
    deviceStats[deviceID].REGISTER_REQ++;

    // Extract apikey from the register message
    let msgObj = JSON.parse(ws['msg']);
    const receivedApiKey = msgObj['apikey'];

    // Get device info from cmd file
    const deviceFromFile = getDeviceFromCmdFile(deviceID);
    const isFirstTime = !deviceFromFile || !deviceFromFile.apikey;

    if (isFirstTime) {
        // FIRST TIME: Device sends its original apikey
        console.log(`   📝 First-time registration - storing device apikey: ${receivedApiKey.substring(0, 8)}...`);
        console.log(`   🔄 Instructing device to switch to proxyAPIKey for local control`);

        // Store device's ORIGINAL apikey in cmd file (for cloud connection)
        const mac = ws['MAC'] || null;
        const ip = ws['IP'] ? ws['IP'].replace('::ffff:', '') : null;

        if (!sONOFF[deviceID].alias || sONOFF[deviceID].alias.startsWith('new-')) {
            sONOFF[deviceID]["alias"] = 'new-' + deviceID;
        }

        updateDeviceInCmdFile(deviceID, sONOFF[deviceID]["alias"], mac, ip, receivedApiKey);

        // Store connection info with BOTH keys
        if (!sONOFF[deviceID]["conn"]) {
            sONOFF[deviceID]["conn"] = {};
        }
        sONOFF[deviceID]["conn"]['deviceApiKey'] = receivedApiKey;  // For cloud
        sONOFF[deviceID]["conn"]['localApiKey'] = proxyAPIKey;      // For local
        sONOFF[deviceID]["conn"]['ws'] = ws;

        // Tell device to use proxyAPIKey from now on
        const response = JSON.stringify({
            error: 0,
            deviceid: deviceID,
            apikey: proxyAPIKey,  // ← Tell device to use proxyAPIKey for local
            config: { hb: 1, hbInterval: 145 }
        });

        ws.send(response);

    } else {
        // RECONNECTION: Device should already be using proxyAPIKey
        if (receivedApiKey === proxyAPIKey) {
            console.log(`   ✅ Device using proxyAPIKey (reconnection)`);
        } else if (receivedApiKey === deviceFromFile.apikey) {
            console.log(`   🔄 Device sent original apikey - instructing to use proxyAPIKey`);
        } else {
            console.log(`   ⚠️  Unknown apikey received: ${receivedApiKey.substring(0, 8)}...`);
        }

        // Store connection info with BOTH keys
        if (!sONOFF[deviceID]["conn"]) {
            sONOFF[deviceID]["conn"] = {};
        }
        sONOFF[deviceID]["conn"]['deviceApiKey'] = deviceFromFile.apikey;  // For cloud
        sONOFF[deviceID]["conn"]['localApiKey'] = proxyAPIKey;             // For local
        sONOFF[deviceID]["conn"]['ws'] = ws;

        // Always respond with proxyAPIKey
        const response = JSON.stringify({
            error: 0,
            deviceid: deviceID,
            apikey: proxyAPIKey,  // ← Always use proxyAPIKey for local control
            config: { hb: 1, hbInterval: 145 }
        });

        ws.send(response);
    }

    deviceStats[deviceID].REGISTER_ACK++;
    startPingMonitoring(ws, deviceID);

    // Update alias if needed
    if (!sONOFF[deviceID].alias || sONOFF[deviceID].alias.startsWith('new-')) {
        if (deviceFromFile && !deviceFromFile.alias.startsWith('new-')) {
            sONOFF[deviceID]["alias"] = deviceFromFile.alias;
        } else {
            console.log(`   🆕 New device needs a name - use: name ${deviceID} <name>`);
        }
    }

    // Store registration string
    sONOFF[deviceID]['registerSTR'] = ws['msg'];

    // Initialize switch state to OFF (will be updated by device's update message)
    DeviceTracking.setSwitchState(deviceID, SwitchState.OFF);

    // Debug logging
    LoggingService.debugLog(deviceID, 'PROXY → DEVICE', 'REGISTER RESPONSE', 
        `Using localApiKey: ${proxyAPIKey.substring(0, 8)}...`);

    // Initiate cloud connection (optional, only if internet available)
    console.log(`🌐 Connecting ${deviceID} "${sONOFF[deviceID].alias}" to cloud...`);
    proxyEvent.emit('devConnEstablished', deviceID);
});

// **DATE ACTION HANDLER**
handleMessage.on('date', (ws) => {
    if (!ws['deviceid']) {
        console.log('⚠️  Received date request without deviceid');
        return;
    }
    
    const deviceID = ws['deviceid'];
    
    // Ensure device object exists
    DeviceTracking.initDeviceObject(deviceID);
    
    // Store date request
    sONOFF[deviceID]['dateSTR'] = ws['msg'];
    
    // Ensure stats exist and increment
    DeviceTracking.initStats(deviceID);
    deviceStats[deviceID].DATE_REQ++;
    
    // **FIXED: Use localApiKey consistently (no cloudApiKey references)**
    const responseApiKey = sONOFF[deviceID].conn?.localApiKey || proxyAPIKey;
    
    // Build response
    const response = JSON.stringify({
        error: 0,
        deviceid: deviceID,
        apikey: responseApiKey,
        date: new Date().toISOString()
    });
    
    // Debug logging
    LoggingService.debugLog(deviceID, 'DEVICE → PROXY', 'DATE REQUEST', ws['msg']);
    LoggingService.debugLog(deviceID, 'PROXY → DEVICE', 'DATE RESPONSE', response);
    
    // Send response
    ws.send(response);
    deviceStats[deviceID].DATE_RES++;
});

// **UPDATE ACTION HANDLER**
handleMessage.on('update', (ws) => {
    if (!ws['deviceid']) {
        console.log('⚠️  Received update without deviceid');
        return;
    }
    
    const deviceID = ws['deviceid'];
    
    // Ensure device object exists
    DeviceTracking.initDeviceObject(deviceID);
    
    // Store update request
    sONOFF[deviceID]['updateSTR'] = ws['msg'];
    
    // Ensure stats exist and increment
    DeviceTracking.initStats(deviceID);
    deviceStats[deviceID].UPDATE_REQ++;
    
    // Parse and update switch state
    let msgObj = JSON.parse(ws['msg']);
    if (msgObj['params'] && msgObj['params']['switch']) {
        DeviceTracking.setSwitchState(deviceID, msgObj['params']['switch']);
    }
    
    // **FIXED: Use localApiKey consistently (no cloudApiKey references)**
    const responseApiKey = sONOFF[deviceID].conn?.localApiKey || proxyAPIKey;
    
    // Build response
    const response = JSON.stringify({
        error: 0,
        deviceid: deviceID,
        apikey: responseApiKey
    });
    
    // Debug logging
    LoggingService.debugLog(deviceID, 'DEVICE → PROXY', 'UPDATE REQUEST', ws['msg']);
    LoggingService.debugLog(deviceID, 'PROXY → DEVICE', 'UPDATE ACK', response);
    
    // Send response
    ws.send(response);
    deviceStats[deviceID].UPDATE_ACK++;
});

// **QUERY ACTION HANDLER**
handleMessage.on('query', (ws) => {
    if (!ws['deviceid']) {
        console.log('⚠️  Received query without deviceid');
        return;
    }
    
    const deviceID = ws['deviceid'];
    
    // Ensure device object exists
    DeviceTracking.initDeviceObject(deviceID);
    
    // Store query request
    sONOFF[deviceID]['querySTR'] = ws['msg'];
    
    // Ensure stats exist and increment
    DeviceTracking.initStats(deviceID);
    deviceStats[deviceID].QUERY_REQ++;
    
    // Debug logging
    LoggingService.debugLog(deviceID, 'DEVICE → PROXY', 'QUERY REQUEST', ws['msg']);
    
    // Note: Query typically doesn't get a direct response from proxy
    // The cloud will respond, and we'll forward that response
    deviceStats[deviceID].QUERY_RES++;
});

// ============================================================================
// CLOUD CONNECTION EVENT HANDLERS
// ============================================================================

// Event handler for when cloud connection is established
proxyEvent.on('cloudConnectionEstablished', (deviceID) => {
    if (sONOFF[deviceID]) {
        console.log(`✅ ${deviceID} "${sONOFF[deviceID].alias}" cloud connection established`);
        
        // Update cloud state to ONLINE
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.ONLINE);
        
        // If local is also REGISTERED or better, set local to ONLINE too
        if (sONOFF[deviceID].localConnectionState === ConnectionState.REGISTERED) {
            DeviceTracking.setLocalConnectionState(deviceID, ConnectionState.ONLINE);
        }
        
        // The isOnline flag will be automatically updated by DeviceTracking
        // when BOTH local and cloud are ONLINE
    }
});

// Event handler for when cloud connection fails
proxyEvent.on('cloudConnectionFailed', (deviceID, reason) => {
    if (sONOFF[deviceID]) {
        console.log(`❌ ${deviceID} "${sONOFF[deviceID].alias}" cloud connection failed: ${reason || 'Unknown'}`);
        
        // Update cloud state to OFFLINE
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
        
        // Note: Local connection might still be REGISTERED/ONLINE
        // Device is not fully functional without cloud
    }
});

// Event handler for when cloud connection is closed
proxyEvent.on('cloudConnectionClosed', (deviceID) => {
    if (sONOFF[deviceID]) {
        console.log(`🔌 ${deviceID} "${sONOFF[deviceID].alias}" cloud disconnected`);
        
        // Update cloud state to OFFLINE
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
        
        // If local connection is also gone, mark as fully offline
        if (!sONOFF[deviceID].conn || !sONOFF[deviceID].conn.ws) {
            DeviceTracking.setLocalConnectionState(deviceID, ConnectionState.OFFLINE);
        }
        
        // The isOnline flag will be automatically updated by DeviceTracking
    }
});
