/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: statusMonitor.mjs
Monitors and reports system status periodically
Updated to display three-state system (local, cloud, switch)
*/

import { sONOFF, ConnectionState, SwitchState } from '../sharedVARs.js';
import { LOGGING_CONFIG } from './config.mjs';
import { DeviceTracking } from './deviceTracking.mjs';

export class StatusMonitor {
    static #timer = null;

    /**
     * Start periodic status monitoring
     */
    static start() {
        if (LOGGING_CONFIG.STATUS_SUMMARY_INTERVAL <= 0) return;
        
        if (this.#timer) {
            clearInterval(this.#timer);
        }
        
        this.#timer = setInterval(() => {
            this.#printStatusSummary();
        }, LOGGING_CONFIG.STATUS_SUMMARY_INTERVAL);
    }

    /**
     * Stop periodic status monitoring
     */
    static stop() {
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = null;
        }
    }

    /**
     * Print detailed status summary with three-state system
     */
    static #printStatusSummary() {
        const devices = Object.keys(sONOFF);
        const total = devices.length;
        
        if (total === 0) {
            console.log(`\n📊 STATUS: No devices configured\n`);
            return;
        }
        
        // Count devices by status
        const fullyOnline = devices.filter(id => sONOFF[id].isOnline).length;
        const localOnly = devices.filter(id => 
            sONOFF[id].localConnectionState === ConnectionState.ONLINE &&
            sONOFF[id].cloudConnectionState !== ConnectionState.ONLINE
        ).length;
        const cloudOnly = devices.filter(id => 
            sONOFF[id].cloudConnectionState === ConnectionState.ONLINE &&
            sONOFF[id].localConnectionState !== ConnectionState.ONLINE
        ).length;
        const offline = devices.filter(id => 
            sONOFF[id].localConnectionState === ConnectionState.OFFLINE &&
            sONOFF[id].cloudConnectionState === ConnectionState.OFFLINE
        ).length;
        
        // Count switch states
        const switchOn = devices.filter(id => sONOFF[id].switchState === SwitchState.ON).length;
        const switchOff = devices.filter(id => sONOFF[id].switchState === SwitchState.OFF).length;
        const switchUnknown = devices.filter(id => sONOFF[id].switchState === SwitchState.UNKNOWN).length;
        
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`📊 STATUS SUMMARY - ${new Date().toLocaleTimeString()}`);
        console.log(`${'═'.repeat(80)}`);
        console.log(`   Total Devices: ${total}`);
        console.log(`   ✅ Fully Online (Local + Cloud): ${fullyOnline}`);
        console.log(`   🔌 Local Only: ${localOnly}`);
        console.log(`   ☁️  Cloud Only: ${cloudOnly}`);
        console.log(`   ⚫ Offline: ${offline}`);
        console.log(``);
        console.log(`   Switch States:`);
        console.log(`   💡 ON: ${switchOn} | OFF: ${switchOff} | UNKNOWN: ${switchUnknown}`);
        
        // Show detailed state breakdown
        console.log(`\n   Device Details:`);
        console.log(`   ${'─'.repeat(76)}`);
        console.log(`   ${'Device'.padEnd(20)} ${'Local'.padEnd(15)} ${'Cloud'.padEnd(15)} ${'Switch'.padEnd(10)} Status`);
        console.log(`   ${'─'.repeat(76)}`);
        
        devices.forEach(id => {
            const device = sONOFF[id];
            const alias = (device.alias || id).substring(0, 18).padEnd(20);
            const local = (device.localConnectionState || ConnectionState.OFFLINE).padEnd(15);
            const cloud = (device.cloudConnectionState || ConnectionState.OFFLINE).padEnd(15);
            const switchState = (device.switchState || SwitchState.UNKNOWN).padEnd(10);
            
            let status = '';
            if (device.isOnline) {
                status = '✅ OK';
            } else if (device.localConnectionState === ConnectionState.ONLINE) {
                status = '⚠️  No Cloud';
            } else if (device.cloudConnectionState === ConnectionState.ONLINE) {
                status = '⚠️  No Local';
            } else if (device.localConnectionState === ConnectionState.REGISTERED) {
                status = '🔄 Registering';
            } else if (device.localConnectionState === ConnectionState.WS_CONNECTED) {
                status = '🔌 Connected';
            } else if (device.localConnectionState === ConnectionState.DISPATCH) {
                status = '📡 Dispatched';
            } else {
                status = '❌ Offline';
            }
            
            console.log(`   ${alias} ${local} ${cloud} ${switchState} ${status}`);
        });
        
        console.log(`   ${'─'.repeat(76)}`);
        
        // Show any problem devices
        const problems = this.#detectProblems();
        
        if (problems.length > 0) {
            console.log(`\n   ⚠️  Issues Detected:`);
            problems.forEach(problem => {
                console.log(`      ${problem.deviceID} "${problem.alias}": ${problem.issue}`);
            });
        }
        
        console.log(`${'═'.repeat(80)}\n`);
    }

    /**
     * Detect devices with problems
     */
    static #detectProblems() {
        const problems = [];
        
        Object.entries(sONOFF).forEach(([id, device]) => {
            // Local connected but not registered
            if (device.localConnectionState === ConnectionState.WS_CONNECTED) {
                problems.push({
                    deviceID: id,
                    alias: device.alias || 'unknown',
                    issue: 'Connected but not registered'
                });
            }
            
            // Registered but cloud not connecting
            if (device.localConnectionState === ConnectionState.REGISTERED && 
                device.cloudConnectionState === ConnectionState.OFFLINE) {
                problems.push({
                    deviceID: id,
                    alias: device.alias || 'unknown',
                    issue: 'Registered but cloud connection failed'
                });
            }
            
            // Local online but no cloud
            if (device.localConnectionState === ConnectionState.ONLINE && 
                device.cloudConnectionState !== ConnectionState.ONLINE) {
                problems.push({
                    deviceID: id,
                    alias: device.alias || 'unknown',
                    issue: 'Local only - cloud unavailable'
                });
            }
            
            // Cloud online but no local (shouldn't happen)
            if (device.cloudConnectionState === ConnectionState.ONLINE && 
                device.localConnectionState !== ConnectionState.ONLINE) {
                problems.push({
                    deviceID: id,
                    alias: device.alias || 'unknown',
                    issue: 'Cloud only - local connection issue'
                });
            }
            
            // Has connection but switch state unknown
            if (device.isOnline && device.switchState === SwitchState.UNKNOWN) {
                problems.push({
                    deviceID: id,
                    alias: device.alias || 'unknown',
                    issue: 'Online but switch state unknown'
                });
            }
        });
        
        return problems;
    }

    /**
     * Get current status summary (for API or testing)
     */
    static getStatusSummary() {
        const devices = Object.keys(sONOFF);
        const total = devices.length;
        
        const fullyOnline = devices.filter(id => sONOFF[id].isOnline).length;
        const localOnly = devices.filter(id => 
            sONOFF[id].localConnectionState === ConnectionState.ONLINE &&
            sONOFF[id].cloudConnectionState !== ConnectionState.ONLINE
        ).length;
        const cloudOnly = devices.filter(id => 
            sONOFF[id].cloudConnectionState === ConnectionState.ONLINE &&
            sONOFF[id].localConnectionState !== ConnectionState.ONLINE
        ).length;
        const offline = devices.filter(id => 
            sONOFF[id].localConnectionState === ConnectionState.OFFLINE &&
            sONOFF[id].cloudConnectionState === ConnectionState.OFFLINE
        ).length;
        
        const switchOn = devices.filter(id => sONOFF[id].switchState === SwitchState.ON).length;
        const switchOff = devices.filter(id => sONOFF[id].switchState === SwitchState.OFF).length;
        const switchUnknown = devices.filter(id => sONOFF[id].switchState === SwitchState.UNKNOWN).length;
        
        const problems = this.#detectProblems();

        return {
            total,
            fullyOnline,
            localOnly,
            cloudOnly,
            offline,
            switchStates: {
                on: switchOn,
                off: switchOff,
                unknown: switchUnknown
            },
            problems,
            devices: devices.map(id => DeviceTracking.getDeviceStatus(id))
        };
    }

    /**
     * Print a compact one-line status
     */
    static printCompactStatus() {
        const summary = this.getStatusSummary();
        console.log(`📊 ${summary.fullyOnline}/${summary.total} online | ON: ${summary.switchStates.on} OFF: ${summary.switchStates.off} | Issues: ${summary.problems.length}`);
    }

    /**
     * Print detailed status for a specific device
     */
    static printDeviceStatus(deviceID) {
        if (!sONOFF[deviceID]) {
            console.log(`❌ Device ${deviceID} not found`);
            return;
        }
        
        const status = DeviceTracking.getDeviceStatus(deviceID);
        
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`📊 DEVICE STATUS: ${status.deviceID} "${status.alias}"`);
        console.log(`${'═'.repeat(80)}`);
        console.log(`   Local Connection:  ${status.localState}`);
        console.log(`   Cloud Connection:  ${status.cloudState}`);
        console.log(`   Switch State:      ${status.switchState}`);
        console.log(`   Fully Online:      ${status.isOnline ? '✅ YES' : '❌ NO'}`);
        console.log(`   Cloud Connected:   ${status.cloudConnected ? '✅ YES' : '❌ NO'}`);
        
        // Show connection details if available
        if (sONOFF[deviceID].conn && sONOFF[deviceID].conn.ws) {
            const ws = sONOFF[deviceID].conn.ws;
            console.log(`\n   Connection Details:`);
            console.log(`   IP Address:        ${ws.IP || 'unknown'}`);
            console.log(`   MAC Address:       ${ws.MAC || 'unknown'}`);
            console.log(`   WebSocket State:   ${['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState]}`);
        }
        
        console.log(`${'═'.repeat(80)}\n`);
    }
}
