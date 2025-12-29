/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: webSocketHandler.mjs
Handles WebSocket connections and communication
Includes smart dispatch checking using cmd file data
Uses three-state system for clear status tracking
FIXED: Proper cleanup of timers when connections are replaced
*/

import { sONOFF, proxyEvent, protocolCapture, deviceDiagnostics, deviceStats, transparentMode, LOGS_DIR, ConnectionState, SwitchState, debugMode } from '../sharedVARs.js';
import { handleMessage } from './messageHandler.mjs';
import { DeviceTracking } from './deviceTracking.mjs';
import { DeviceIdentification } from './deviceIdentification.mjs';
import { LoggingService } from './loggingService.mjs';
import { WEBSOCKET_CONFIG, LOGGING_CONFIG, DIAGNOSTIC_CONFIG } from './config.mjs';
import { TransparentMode } from '../transparentMode-modules/transparentMode.mjs';

// Track active connections to prevent orphaned timer issues
const activeConnectionsByIP = new Map();      // IP -> connection object
const activeConnectionsByDeviceID = new Map(); // deviceID -> connection object

export class WebSocketHandler {
    
    /**
     * Clear all timers for a connection object
     */
    static #clearConnectionTimers(connection, reason = '') {
        if (!connection) return;
        
        let cleared = [];
        
        if (connection.identificationTimeout) {
            clearTimeout(connection.identificationTimeout);
            connection.identificationTimeout = null;
            cleared.push('identification');
        }
        if (connection.firstMessageTimeout) {
            clearTimeout(connection.firstMessageTimeout);
            connection.firstMessageTimeout = null;
            cleared.push('firstMessage');
        }
        if (connection.pingTimeoutChecker) {
            clearInterval(connection.pingTimeoutChecker);
            connection.pingTimeoutChecker = null;
            cleared.push('pingChecker');
        }
        
        if (cleared.length > 0 && LOGGING_CONFIG.VERBOSE) {
            const deviceInfo = connection.ws?.deviceid || connection.ws?.deviceID || connection.ws?.IP || 'unknown';
            console.log(`🧹 Cleared timers for ${deviceInfo}: [${cleared.join(', ')}] ${reason}`);
        }
    }
    
    /**
     * Clean up old connection from same IP (prevents orphaned timers)
     */
    static #cleanupExistingConnectionByIP(deviceIP) {
        const existing = activeConnectionsByIP.get(deviceIP);
        if (existing && existing.ws) {
            // Clear all timers from the old connection
            this.#clearConnectionTimers(existing, '(replaced by new connection from same IP)');
            
            // Close old WebSocket if still open
            if (existing.ws.readyState === 1) { // OPEN
                console.log(`🔄 Closing old connection from ${deviceIP} (new connection incoming)`);
                existing.ws.close(1001, 'Replaced by new connection');
            }
        }
        activeConnectionsByIP.delete(deviceIP);
    }
    
    /**
     * Clean up old connection for same device ID
     */
    static #cleanupExistingConnectionByDeviceID(deviceID) {
        const existing = activeConnectionsByDeviceID.get(deviceID);
        if (existing && existing.ws) {
            this.#clearConnectionTimers(existing, `(replaced by new connection for ${deviceID})`);
            
            if (existing.ws.readyState === 1) {
                console.log(`🔄 Closing old connection for ${deviceID} (new connection incoming)`);
                existing.ws.close(1001, 'Replaced by new connection');
            }
        }
        activeConnectionsByDeviceID.delete(deviceID);
    }
    
    /**
     * Register connection in tracking maps
     */
    static #registerConnection(ws, deviceIP, deviceID = null) {
        const connectionObj = {
            ws,
            ip: deviceIP,
            deviceID,
            identificationTimeout: ws.identificationTimeout,
            firstMessageTimeout: ws.firstMessageTimeout,
            pingTimeoutChecker: ws.pingTimeoutChecker,
            createdAt: Date.now()
        };
        
        activeConnectionsByIP.set(deviceIP, connectionObj);
        
        if (deviceID) {
            activeConnectionsByDeviceID.set(deviceID, connectionObj);
        }
        
        return connectionObj;
    }
    
    /**
     * Update connection tracking when device identifies
     */
    static updateConnectionDeviceID(ws, deviceID) {
        const deviceIP = ws.IP;
        
        // Clean up any existing connection for this device ID
        this.#cleanupExistingConnectionByDeviceID(deviceID);
        
        // Get or create connection object
        let connectionObj = activeConnectionsByIP.get(deviceIP);
        if (connectionObj && connectionObj.ws === ws) {
            connectionObj.deviceID = deviceID;
            // Sync timer references
            connectionObj.identificationTimeout = ws.identificationTimeout;
            connectionObj.firstMessageTimeout = ws.firstMessageTimeout;
            connectionObj.pingTimeoutChecker = ws.pingTimeoutChecker;
        } else {
            connectionObj = this.#registerConnection(ws, deviceIP, deviceID);
        }
        
        activeConnectionsByDeviceID.set(deviceID, connectionObj);
        
        // Clear identification timeout since device has identified
        if (ws.identificationTimeout) {
            clearTimeout(ws.identificationTimeout);
            ws.identificationTimeout = null;
            connectionObj.identificationTimeout = null;
        }
        
        // Clear first message timeout if still running
        if (ws.firstMessageTimeout) {
            clearTimeout(ws.firstMessageTimeout);
            ws.firstMessageTimeout = null;
            connectionObj.firstMessageTimeout = null;
        }
    }
    
    /**
     * Check if this WebSocket is still the active connection for its IP
     */
    static #isActiveConnection(ws) {
        const deviceIP = ws.IP;
        const activeConn = activeConnectionsByIP.get(deviceIP);
        return activeConn && activeConn.ws === ws;
    }

    /**
     * Handle incoming WebSocket connection
     */
    static async handleConnection(ws, req) {
        let deviceIP = req.connection.remoteAddress.replace('::ffff:', '');
        ws['IP'] = deviceIP;

        // **CRITICAL: Clean up any existing connection from this IP FIRST**
        this.#cleanupExistingConnectionByIP(deviceIP);

        // Per-connection state - store on ws object for accessibility
        ws.preIdentificationPings = 0;
        ws.identificationTimeout = null;
        ws.pingTimeoutChecker = null;
        ws.firstMessageTimeout = null;
        ws.prevPingTime = Date.now();
        ws.receivedFirstMessage = false;
        ws.connectionStartTime = Date.now();

        // Get MAC address for this connection
        const macAddress = await DeviceIdentification.getMACfromIP(deviceIP);
        if (macAddress) {
            ws['MAC'] = macAddress;
        }

        // Try to identify device early
        const identification = DeviceIdentification.findDeviceByNetworkInfo(deviceIP, macAddress);

        // **SMART VALIDATION - Accept known devices, require dispatch for unknown**
        if (identification) {
            const deviceID = identification.deviceID;
            ws['deviceID'] = deviceID;
            
            // Clean up any existing connection for this device ID too
            this.#cleanupExistingConnectionByDeviceID(deviceID);
            
            // Import needed functions
            const { dispatch } = await import('../sharedVARs.js');
            const { checkDeviceCompleteness, getDeviceFromCmdFile } = await import('../cmd-modules/cmdFileManager.mjs');
            
            // Check if we have recent dispatch data
            const hasDispatch = dispatch[deviceID];
            const dispatchAge = deviceDiagnostics[deviceID]?.lastDispatchTime 
                ? (new Date() - new Date(deviceDiagnostics[deviceID].lastDispatchTime)) / 1000 
                : Infinity;
            
            const DISPATCH_MAX_AGE = 300; // 5 minutes
            const hasRecentDispatch = hasDispatch && dispatchAge <= DISPATCH_MAX_AGE;
            
            if (hasRecentDispatch) {
                // Has recent dispatch - best case
                console.log(`✅ ${deviceID} "${identification.alias}" has fresh dispatch (${dispatchAge.toFixed(0)}s ago)`);
                
                // Update state to WS-CONNECTED
                DeviceTracking.initDeviceObject(deviceID, identification.alias);
                DeviceTracking.setLocalConnectionState(deviceID, ConnectionState.WS_CONNECTED);
                
            } else {
                // No recent dispatch - check if we KNOW this device
                const completeness = checkDeviceCompleteness(deviceID);
                
                if (completeness.complete) {
                    // Known device with complete data - ACCEPT (proxy restart scenario)
                    const deviceFromFile = completeness.device;
                    console.log(`✅ ${deviceID} "${identification.alias}" reconnecting (known device)`);
                    console.log(`   📋 Using stored apikey: ${deviceFromFile.apikey.substring(0, 8)}...`);
                    
                    // Initialize device object
                    DeviceTracking.initDeviceObject(deviceID, deviceFromFile.alias);
                    
                    // Create synthetic dispatch record from cmd file data
                    const syntheticDispatch = JSON.stringify({
                        deviceid: deviceID,
                        apikey: deviceFromFile.apikey,
                        model: 'ITA-GZ1-GL',
                        romVersion: '3.5.0',
                        ip: deviceIP,
                        mac: macAddress,
                        source: 'cmd-file-reconnect'
                    });
                    
                    dispatch[deviceID] = syntheticDispatch;
                    
                    // Initialize diagnostics and FLAG synthetic dispatch
                    DeviceTracking.initStats(deviceID);
                    DeviceTracking.initDiagnostics(deviceID);
                    deviceDiagnostics[deviceID].lastDispatchTime = new Date().toISOString();
                    deviceDiagnostics[deviceID].lastDispatchIP = deviceIP;
                    deviceDiagnostics[deviceID].lastDispatchMAC = macAddress || null;
                    deviceDiagnostics[deviceID].usingSyntheticDispatch = true;  // **FLAG IT**
                    
                    // Update state to WS-CONNECTED
                    DeviceTracking.setLocalConnectionState(deviceID, ConnectionState.WS_CONNECTED);
                    
                    console.log(`   ✅ Ready to accept registration (synthetic dispatch created)`);
                    
                } else {
                    // Truly unknown device or missing critical data - REJECT
                    console.log(`❌ ${deviceID} "${identification.alias}" is unknown or incomplete`);
                    console.log(`   Missing: ${completeness.missing.join(', ')}`);
                    console.log(`   💡 Expected HTTP dispatch first, but not received`);
                    console.log(`   🔄 Try: power cycle device or check DNS/network configuration`);
                    
                    DeviceTracking.initDiagnostics(deviceID);
                    DeviceTracking.logConnectionAttempt(
                        deviceID, 
                        deviceIP, 
                        'WEBSOCKET', 
                        false, 
                        `Rejected: Unknown or incomplete (missing: ${completeness.missing.join(', ')})`
                    );
                    
                    console.log(`   ℹ️  Device will need to perform HTTP POST to /dispatch/device`);
                    
                    ws.close(1008, 'Unknown device - must dispatch first');
                    return; // Exit early
                }
            }
        } else {
            // Completely unknown connection
            console.log(`🔌 Unknown device connecting from ${deviceIP} (MAC: ${macAddress || 'unknown'})`);
            console.log(`   ⚠️  Waiting for identification...`);
        }

        // Log connection
        if (LOGGING_CONFIG.VERBOSE) {
            console.log('\n' + '─'.repeat(80));
            console.log(`🔌 WebSocket connection from ${deviceIP} (MAC: ${macAddress || 'unknown'})`);
            if (identification) {
                console.log(`   Device: ${identification.deviceID} "${identification.alias}"`);
            }
            console.log('─'.repeat(80));
        } else if (identification) {
            console.log(`🔌 ${identification.deviceID} "${identification.alias}" connecting... (${deviceIP})`);
        }

        // Track WebSocket connection attempt timing
        let wsAttemptTime = new Date();
        
        // Update diagnostics if we identified the device
        if (identification) {
            DeviceTracking.initDiagnostics(identification.deviceID);
            deviceDiagnostics[identification.deviceID].lastWebSocketAttemptTime = wsAttemptTime.toISOString();
            deviceDiagnostics[identification.deviceID].lastWebSocketAttemptIP = deviceIP;
            deviceDiagnostics[identification.deviceID].lastWebSocketAttemptMAC = macAddress || null;
        }

        // Check if this IP is being captured and log the connection
        if (protocolCapture.enabled && deviceIP === protocolCapture.ip) {
            const logData = {
                IP: deviceIP,
                MAC: macAddress,
                URL: req.url,
                Headers: req.headers,
                Time: wsAttemptTime.toISOString()
            };
            console.log(`*** CAPTURE MODE: WebSocket connection attempt from ${deviceIP} ***`);
            if (protocolCapture.logFile) {
                LoggingService.captureLog('DEVICE -> PROXY (WSS CONNECT)', JSON.stringify(logData, null, 2));
            }
        }

        // Setup event handlers
        this.#setupPingHandler(ws, deviceIP, macAddress);
        this.#setupMessageHandler(ws, deviceIP, macAddress);
        this.#setupCloseHandler(ws, deviceIP, macAddress, wsAttemptTime);
        this.#setupErrorHandler(ws, deviceIP, macAddress);

        // Setup timeouts (FIXED HIERARCHY)
        // if (ws.readyState === 1) {
        //     ws.send(JSON.stringify({ "error": 0, "deviceid": "", "apikey": "" }));
        //     console.log(`📡 Poked ${deviceIP} to trigger identification`);
        // }
        this.#setupFirstMessageTimeout(ws, deviceIP, macAddress);
        this.#setupIdentificationTimeout(ws, deviceIP, macAddress);
        
        // **CRITICAL: Register this connection AFTER setting up timeouts**
        this.#registerConnection(ws, deviceIP, identification?.deviceID);
    }

    /**
     * Setup ping handler
     */
    static #setupPingHandler(ws, deviceIP, macAddress) {
        ws.on('ping', () => {
            // **Check if this is still the active connection**
            if (!this.#isActiveConnection(ws)) {
                if (LOGGING_CONFIG.VERBOSE) {
                    console.log(`📶 Ignoring ping from stale connection (${deviceIP})`);
                }
                return;
            }
            
            const currentTime = Date.now();
            const timeDifference = (currentTime - ws.prevPingTime) / 1000;
            ws.prevPingTime = currentTime;

            if (ws['deviceid']) {
                // Device has identified itself
                if (ws.preIdentificationPings > 0 && LOGGING_CONFIG.VERBOSE) {
                    console.log(`ℹ️  Device ${ws['deviceid']} sent ${ws.preIdentificationPings} pings before identifying`);
                    ws.preIdentificationPings = 0;
                }

                // Only log if verbose mode or unusual timing
                if (LOGGING_CONFIG.VERBOSE || LOGGING_CONFIG.SHOW_ROUTINE_PINGS || timeDifference > 20 || timeDifference < 5) {
                    console.log(`📶 ${ws['deviceid']}: ${timeDifference.toFixed(1)}s since last ping`);
                }
                
                DeviceTracking.initStats(ws['deviceid']);
                deviceStats[ws['deviceid']].PING_COUNT++;
                
                LoggingService.debugLog(ws['deviceid'], 'DEVICE → PROXY', 'PING', `Time since last: ${timeDifference}s`);
                
                proxyEvent.emit('pingReceived', ws['deviceid']);
            } else {
                const deviceID = ws['deviceID'];
                
                if (deviceID && sONOFF[deviceID]) {
                    const currentState = sONOFF[deviceID].localConnectionState;
                    
                    if (currentState === 'WS-CONNECTED') {
                        // Device is connected but not registered, yet sending pings
                        console.log(`📶 Ping from WS-CONNECTED device ${deviceID} "${sONOFF[deviceID].alias}"`);
                        console.log(`   ✅ Auto-promoting to REGISTERED (known device sending pings)`);
                        
                        // Update local state
                        DeviceTracking.setLocalConnectionState(deviceID, ConnectionState.REGISTERED);
                        
                        return; // Important: don't process as unregistered ping
                    }
                }

                // Device hasn't identified yet
                ws.preIdentificationPings++;
                
                // Only log every N pings to reduce spam
                if (LOGGING_CONFIG.SHOW_PREID_PING_EVERY > 0 && ws.preIdentificationPings % LOGGING_CONFIG.SHOW_PREID_PING_EVERY === 1) {
                    const identification = DeviceIdentification.findDeviceByNetworkInfo(deviceIP, macAddress);
                    
                    if (identification) {
                        console.log(`📶 Unregistered pings from ${identification.deviceID} "${identification.alias}" (count: ${ws.preIdentificationPings})`);
                    } else {
                        console.log(`📶 Unregistered pings from ${deviceIP} (MAC: ${macAddress || 'unknown'}, count: ${ws.preIdentificationPings})`);
                    }
                }
            }
        });
    }

    /**
     * Start ping timeout monitoring
     * Called AFTER successful registration (from messageHandler REGISTER action)
     */
    static startPingMonitoring(ws, deviceID) {
        // Clear any existing monitor for this device
        if (ws.pingTimeoutChecker) {
            clearInterval(ws.pingTimeoutChecker);
            ws.pingTimeoutChecker = null;
        }
        
        ws.pingTimeoutChecker = setInterval(() => {
            // **Check if this is still the active connection**
            if (!this.#isActiveConnection(ws)) {
                clearInterval(ws.pingTimeoutChecker);
                ws.pingTimeoutChecker = null;
                if (LOGGING_CONFIG.VERBOSE) {
                    console.log(`🧹 Stopped ping monitoring for stale connection (${deviceID})`);
                }
                return;
            }
            
            const timeSinceLastPing = Date.now() - ws.prevPingTime;
            
            if (timeSinceLastPing > WEBSOCKET_CONFIG.PING_TIMEOUT) {
                const deviceAlias = sONOFF[deviceID]?.alias || 'unknown';
                
                console.log(`⚠️  PING TIMEOUT: ${deviceID} "${deviceAlias}" (${(timeSinceLastPing/1000).toFixed(0)}s)`);
                
                DeviceTracking.logConnectionAttempt(deviceID, ws.IP, 'PING_TIMEOUT', false, `No ping for ${(timeSinceLastPing/1000).toFixed(0)}s`);
                
                // Clear this interval
                clearInterval(ws.pingTimeoutChecker);
                ws.pingTimeoutChecker = null;
                
                // Close the connection
                ws.close(1001, 'Ping timeout');
            }
        }, WEBSOCKET_CONFIG.PING_CHECK_INTERVAL);
        
        // Update connection tracking
        const connectionObj = activeConnectionsByIP.get(ws.IP);
        if (connectionObj && connectionObj.ws === ws) {
            connectionObj.pingTimeoutChecker = ws.pingTimeoutChecker;
        }
        
        if (LOGGING_CONFIG.VERBOSE) {
            console.log(`✅ Ping monitoring started for ${deviceID}`);
        }
    }

    /**
     * Setup message handler
     */
    static #setupMessageHandler(ws, deviceIP, macAddress) {
        ws.on('message', (message) => {
            const messageString = message.toString();
            
            // Mark that we received a message
            if (!ws.receivedFirstMessage) {
                ws.receivedFirstMessage = true;
                const timeToFirstMessage = ((Date.now() - ws.connectionStartTime) / 1000).toFixed(2);
                
                if (LOGGING_CONFIG.VERBOSE) {
                    console.log(`✅ First message from ${deviceIP} after ${timeToFirstMessage}s`);
                }
                
                // Clear first message timeout
                if (ws.firstMessageTimeout) {
                    clearTimeout(ws.firstMessageTimeout);
                    ws.firstMessageTimeout = null;
                    
                    // Update connection tracking
                    const connectionObj = activeConnectionsByIP.get(deviceIP);
                    if (connectionObj && connectionObj.ws === ws) {
                        connectionObj.firstMessageTimeout = null;
                    }
                }
            }

            // Log incoming WSS message if capture is enabled
            console.log('🔐 WSS MESSAGE RECEIVED from', ws.deviceid);
            console.log(':', message.toString());

            if (protocolCapture.enabled && 
               (deviceIP === protocolCapture.ip || (ws.deviceid && ws.deviceid === protocolCapture.deviceId))) {
                
                if (!protocolCapture.logFile && ws.deviceid) {
                    protocolCapture.logFile = `${LOGS_DIR}/${ws.deviceid}.log`;
                    const logData = {
                        IP: deviceIP,
                        MAC: macAddress,
                    };
                    LoggingService.captureLog('DEVICE -> PROXY (WSS CONNECT)', JSON.stringify(logData, null, 2));
                }
                
                LoggingService.captureLog('DEVICE -> PROXY (WSS RAW MSG)', messageString);
            }

            // Pass the message to the handler
            try {
                handleMessage(ws, messageString, deviceIP);
            } catch (err) {
                console.error(`❌ Error processing message from ${deviceIP}:`, err.message);
                
                if (ws.deviceid) {
                    DeviceTracking.logConnectionAttempt(ws.deviceid, deviceIP, 'MESSAGE_ERROR', false, err.message);
                }
            }
        });
    }

    /**
     * Setup close handler
     */
    static #setupCloseHandler(ws, deviceIP, macAddress, wsAttemptTime) {
        ws.on('close', (code, reason) => {
            const deviceID = ws['deviceid'];
            const closeTime = new Date();
            const reasonString = reason ? reason.toString() : '';
            const connectionDuration = ((Date.now() - ws.connectionStartTime) / 1000).toFixed(1);
            const timeSinceLastPing = ((Date.now() - ws.prevPingTime) / 1000).toFixed(1);

            // **Check if this was the active connection**
            const wasActiveConnection = this.#isActiveConnection(ws);
            
            // **CRITICAL: Clean up tracking maps ONLY if this was the active connection**
            if (wasActiveConnection) {
                activeConnectionsByIP.delete(deviceIP);
                if (deviceID) {
                    activeConnectionsByDeviceID.delete(deviceID);
                }
            } else if (LOGGING_CONFIG.VERBOSE) {
                console.log(`ℹ️  Closed connection was not the active one (already replaced)`);
            }

            // **FIXED: If device successfully registered and is closing normally, disable debug ONLY if auto-enabled**
            if (deviceID && DeviceIdentification.isValidDeviceID(deviceID)) {
                const wasSuccessful = deviceDiagnostics[deviceID]?.lastWebSocketSuccessTime && 
                                      new Date(deviceDiagnostics[deviceID].lastWebSocketSuccessTime) >= wsAttemptTime;
                
                // Only auto-disable debug if it was auto-enabled AND session was successful
                if (wasSuccessful && code !== 1006 && code !== 1008) {
                    if (debugMode.enabled && debugMode.deviceId === deviceID && debugMode.autoEnabled) {
                        LoggingService.disableDebugForDevice(deviceID);
                    }
                }
            }

            // Only show verbose close details if verbose mode or if it's an error/unexpected
            const isUnexpected = code === 1006 || parseFloat(connectionDuration) < 30 || !deviceID;
            
            if (LOGGING_CONFIG.VERBOSE || isUnexpected) {
                console.log('\n' + '─'.repeat(80));
                console.log(`🔌 WebSocket CLOSED: ${deviceID || 'Unidentified'} ${deviceID ? `"${sONOFF[deviceID]?.alias || 'unknown'}"` : ''}`);
                console.log(`   Code: ${code}, Reason: ${reasonString || 'None'}`);
                console.log(`   Duration: ${connectionDuration}s, Last ping: ${timeSinceLastPing}s ago`);
                console.log(`   Was active connection: ${wasActiveConnection}`);
                
                if (code === 1006) {
                    console.log(`   ⚠️  Abnormal closure - possible network issue or device crash`);
                }
                console.log('─'.repeat(80));
            } else {
                // Normal disconnect - just one line
                console.log(`🔌 ${deviceID} "${sONOFF[deviceID]?.alias || 'unknown'}" disconnected (${connectionDuration}s session)`);
            }

            // Log WSS close if capture is enabled
            if (protocolCapture.enabled && (deviceIP === protocolCapture.ip || (deviceID && deviceID === protocolCapture.deviceId))) {
                const logData = {
                    DeviceID: deviceID || 'UNKNOWN',
                    IP: deviceIP,
                    MAC: macAddress,
                    Code: code,
                    Reason: reasonString,
                    Duration: connectionDuration + 's',
                    LastPing: timeSinceLastPing + 's ago',
                    WasActiveConnection: wasActiveConnection,
                    Time: closeTime.toISOString()
                };
                LoggingService.captureLog('DEVICE -> PROXY (WSS CLOSE)', JSON.stringify(logData, null, 2));
            }

            // **Cleanup transparent mode if this was the device**
            if (transparentMode.enabled && deviceID === transparentMode.deviceId) {
                console.log(`🔍 Transparent: Device disconnected, cleaning up...`);
                // Clear deviceid on ws before cleanup
                if (ws['deviceid']) {
                    delete ws['deviceid'];
                }
                TransparentMode.cleanup();
            }

            // Clean up all timeouts and intervals (safety net - should already be cleared)
            if (ws.identificationTimeout) {
                clearTimeout(ws.identificationTimeout);
                ws.identificationTimeout = null;
            }
            if (ws.pingTimeoutChecker) {
                clearInterval(ws.pingTimeoutChecker);
                ws.pingTimeoutChecker = null;
            }
            if (ws.firstMessageTimeout) {
                clearTimeout(ws.firstMessageTimeout);
                ws.firstMessageTimeout = null;
            }

            // If device was identified AND this was the active connection, update diagnostics and emit event
            if (deviceID && DeviceIdentification.isValidDeviceID(deviceID) && wasActiveConnection) {
                // Update diagnostics
                DeviceTracking.initDiagnostics(deviceID);
                deviceDiagnostics[deviceID].lastOfflineTime = closeTime.toISOString();

                // Only log as failure if never successfully registered
                const wasSuccessful = deviceDiagnostics[deviceID].lastWebSocketSuccessTime && 
                                      new Date(deviceDiagnostics[deviceID].lastWebSocketSuccessTime) >= wsAttemptTime;
                
                if (!wasSuccessful) {
                    DeviceTracking.logConnectionAttempt(deviceID, deviceIP, 'WEBSOCKET', false, `Close code ${code}: ${reasonString}`);
                }

                // Update connection states
                if (sONOFF[deviceID]) {
                    const wasOnline = sONOFF[deviceID].isOnline;
                    
                    // Update local connection state to OFFLINE
                    DeviceTracking.setLocalConnectionState(deviceID, ConnectionState.OFFLINE);
                    
                    // Only clear the connection if it's THIS connection
                    if (sONOFF[deviceID].conn && sONOFF[deviceID].conn.ws === ws) {
                        sONOFF[deviceID]['conn'] = null;
                        
                        // Check for quick reconnection
                        if (wasOnline) {
                            setTimeout(() => {
                                if (sONOFF[deviceID] && sONOFF[deviceID].isOnline) {
                                    const offlineDuration = (Date.now() - closeTime.getTime()) / 1000;
                                    console.log(`🔄 ${deviceID} "${sONOFF[deviceID].alias}" reconnected (${offlineDuration.toFixed(1)}s offline)`);
                                }
                            }, WEBSOCKET_CONFIG.RECONNECTION_CHECK_DELAY);
                        }
                    }
                }
                
                // Emit event to close cloud connection
                proxyEvent.emit('proxy2deviceConnectionClosed', deviceID);
            
            } else if (!deviceID) {
                // Device never identified itself
                const identification = DeviceIdentification.findDeviceByNetworkInfo(deviceIP, macAddress);
                if (identification) {
                    console.log(`🔌 Likely ${identification.deviceID} "${identification.alias}" disconnected without identifying`);
                    if (wasActiveConnection) {
                        DeviceTracking.logConnectionAttempt(identification.deviceID, deviceIP, 'WEBSOCKET', false, `Closed before identification (Code ${code})`);
                    }
                }
            }
        });
    }

    /**
     * Setup error handler
     */
    static #setupErrorHandler(ws, deviceIP, macAddress) {
        ws.on('error', (err) => {
            const deviceID = ws['deviceid'];
            
            console.error(`❌ WebSocket error: ${deviceID || deviceIP} - ${err.message}`);

            // Log WSS error if capture is enabled
            if (protocolCapture.enabled && (deviceIP === protocolCapture.ip || (deviceID && deviceID === protocolCapture.deviceId))) {
                const logData = {
                    DeviceID: deviceID || 'UNKNOWN',
                    IP: deviceIP,
                    MAC: macAddress,
                    Error: err.message,
                    Code: err.code,
                    Time: new Date().toISOString()
                };
                LoggingService.captureLog('DEVICE -> PROXY (WSS ERROR)', JSON.stringify(logData, null, 2));
            }

            // Log error in diagnostics
            let errorDeviceID = deviceID;
            if (!errorDeviceID) {
                const identification = DeviceIdentification.findDeviceByNetworkInfo(deviceIP, macAddress);
                if (identification) {
                    errorDeviceID = identification.deviceID;
                }
            }
            
            if (errorDeviceID && DeviceIdentification.isValidDeviceID(errorDeviceID)) {
                DeviceTracking.logConnectionAttempt(errorDeviceID, deviceIP, 'WEBSOCKET', false, err.message);
                
                // Check for TLS errors
                if (err.message.includes('TLS') || err.message.includes('SSL') || err.message.includes('handshake')) {
                    DeviceTracking.initDiagnostics(errorDeviceID);
                    deviceDiagnostics[errorDeviceID].tlsErrors.push({
                        timestamp: new Date().toISOString(),
                        ip: deviceIP,
                        error: err.message,
                        code: err.code
                    });
                    if (deviceDiagnostics[errorDeviceID].tlsErrors.length > DIAGNOSTIC_CONFIG.MAX_ERROR_ENTRIES) {
                        deviceDiagnostics[errorDeviceID].tlsErrors.shift();
                    }
                }
            }
        });
    }

    /**
     * Setup first message timeout (MUST be shorter than identification timeout)
     */
    static #setupFirstMessageTimeout(ws, deviceIP, macAddress) {
        ws.firstMessageTimeout = setTimeout(() => {
            // **CRITICAL: Check if this is still the active connection**
            if (!this.#isActiveConnection(ws)) {
                if (LOGGING_CONFIG.VERBOSE) {
                    console.log(`⏱️  First message timeout skipped - connection replaced (${deviceIP})`);
                }
                return;
            }
            
            // Only apply if device hasn't sent any messages
            if (!ws.receivedFirstMessage) {
                const identification = DeviceIdentification.findDeviceByNetworkInfo(deviceIP, macAddress);
                
                if (identification) {
                    console.log(`⚠️  ${identification.deviceID} "${identification.alias}" connected but not sending messages (${WEBSOCKET_CONFIG.FIRST_MESSAGE_TIMEOUT/1000}s)`);
                    console.log(`   🔍 Enabling debug mode and forcing reconnection...`);
                    
                    LoggingService.enableDebugForDevice(
                        identification.deviceID, 
                        `Connected but silent for ${WEBSOCKET_CONFIG.FIRST_MESSAGE_TIMEOUT/1000}s - forcing reconnection`,
                        false  // auto-enabled
                    );
                    
                    LoggingService.debugLog(identification.deviceID, 'CONNECTION INFO', 'STUCK DEVICE DETECTED', 
                        `IP: ${deviceIP}\nMAC: ${macAddress}\nConnected at: ${new Date(ws.connectionStartTime).toISOString()}\nDuration: ${WEBSOCKET_CONFIG.FIRST_MESSAGE_TIMEOUT/1000}s\nNo messages received`
                    );
                    
                } else {
                    // Unknown device - log but don't close
                }
            } else if (LOGGING_CONFIG.VERBOSE) {
                // Device has sent messages - this is NORMAL
                console.log(`✅ Device ${ws.deviceid || 'at ' + deviceIP} is communicating normally`);
            }
        }, WEBSOCKET_CONFIG.FIRST_MESSAGE_TIMEOUT);
    }

    /**
     * Setup identification timeout (fires AFTER first message timeout)
     */
    static #setupIdentificationTimeout(ws, deviceIP, macAddress) {
        ws.identificationTimeout = setTimeout(() => {
            // **CRITICAL: Check if this is still the active connection**
            if (!this.#isActiveConnection(ws)) {
                if (LOGGING_CONFIG.VERBOSE) {
                    console.log(`⏱️  Identification timeout skipped - connection replaced (${deviceIP})`);
                }
                return;
            }
            
            if (!ws['deviceid']) {
                const identification = DeviceIdentification.findDeviceByNetworkInfo(deviceIP, macAddress);
                
                if (identification) {
                    console.log(`⏱️  ${identification.deviceID} "${identification.alias}" timeout (no registration in ${WEBSOCKET_CONFIG.IDENTIFICATION_TIMEOUT/1000}s)`);
                    console.log(`   🔍 Enabling debug mode and logging timeout details...`);
                    
                    // Enable debug for this device
                    LoggingService.enableDebugForDevice(
                        identification.deviceID,
                        `Timeout - no registration in ${WEBSOCKET_CONFIG.IDENTIFICATION_TIMEOUT/1000}s`,
                        false  // auto-enabled
                    );
                    
                    // Log all available info
                    LoggingService.debugLog(identification.deviceID, 'TIMEOUT INFO', 'NO REGISTRATION', 
                        `IP: ${deviceIP}\nMAC: ${macAddress}\nConnected at: ${new Date(ws.connectionStartTime).toISOString()}\nDuration: ${WEBSOCKET_CONFIG.IDENTIFICATION_TIMEOUT/1000}s\nPings received: ${ws.preIdentificationPings}\nMessages received: ${ws.receivedFirstMessage}\nConnection state: ${['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState]}`
                    );
                    
                    DeviceTracking.logConnectionAttempt(identification.deviceID, deviceIP, 'WEBSOCKET', false, 'Timeout: Did not identify');
                    
                    console.log(`   🔄 Closing connection - device will reconnect with debug enabled...`);
                    
                } else {
                    console.log(`⏱️  ${deviceIP} timeout (no identification in ${WEBSOCKET_CONFIG.IDENTIFICATION_TIMEOUT/1000}s)`);
                }
                
                // Log WSS timeout if capture is enabled
                if (protocolCapture.enabled && deviceIP === protocolCapture.ip) {
                    const logData = {
                        IP: deviceIP,
                        MAC: macAddress,
                        Error: `Timeout after ${WEBSOCKET_CONFIG.IDENTIFICATION_TIMEOUT / 1000}s`,
                        Pings: ws.preIdentificationPings,
                        MessageReceived: ws.receivedFirstMessage,
                        Time: new Date().toISOString()
                    };
                    LoggingService.captureLog('PROXY (WSS TIMEOUT)', JSON.stringify(logData, null, 2));
                }
                
                ws.close(1008, 'Identification timeout');
            }
        }, WEBSOCKET_CONFIG.IDENTIFICATION_TIMEOUT);
    }

    /**
     * Handle duplicate connection (close old one)
     */
    static handleDuplicateConnection(deviceID, newWs, newIP) {
        // Use the new cleanup method
        this.#cleanupExistingConnectionByDeviceID(deviceID);
        return true;
    }
    
    /**
     * Get connection stats (for debugging)
     */
    static getConnectionStats() {
        return {
            byIP: Array.from(activeConnectionsByIP.entries()).map(([ip, conn]) => ({
                ip,
                deviceID: conn.deviceID,
                age: Math.round((Date.now() - conn.createdAt) / 1000) + 's',
                hasTimers: {
                    identification: !!conn.identificationTimeout,
                    firstMessage: !!conn.firstMessageTimeout,
                    pingChecker: !!conn.pingTimeoutChecker
                }
            })),
            byDeviceID: Array.from(activeConnectionsByDeviceID.entries()).map(([deviceID, conn]) => ({
                deviceID,
                ip: conn.ip,
                age: Math.round((Date.now() - conn.createdAt) / 1000) + 's'
            }))
        };
    }
}

// Export the startPingMonitoring method for use in messageHandler
export const startPingMonitoring = WebSocketHandler.startPingMonitoring.bind(WebSocketHandler);

// Export updateConnectionDeviceID for use when device identifies
export const updateConnectionDeviceID = WebSocketHandler.updateConnectionDeviceID.bind(WebSocketHandler);
