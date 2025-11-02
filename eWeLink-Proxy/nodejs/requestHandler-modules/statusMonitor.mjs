/*
Author: Matteo Palitto
Date: January 9, 2024

Description: statusMonitor.mjs
Monitors and reports system status periodically
*/

import { sONOFF } from '../sharedVARs.js';
import { LOGGING_CONFIG } from './config.mjs';

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
     * Print status summary
     */
    static #printStatusSummary() {
        const online = Object.values(sONOFF).filter(d => d.isOnline).length;
        const total = Object.keys(sONOFF).length;
        const cloudConnected = Object.values(sONOFF).filter(d => d.cloudConnected).length;
        
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`📊 STATUS SUMMARY - ${new Date().toLocaleTimeString()}`);
        console.log(`${'═'.repeat(80)}`);
        console.log(`   Devices: ${online}/${total} online, ${cloudConnected} with cloud connection`);
        
        // Show any problem devices
        const problems = Object.entries(sONOFF).filter(([id, d]) => 
            (d.conn && d.conn.ws && !d.isOnline) || // Has connection but not online
            (d.isOnline && !d.cloudConnected) // Online but no cloud
        );
        
        if (problems.length > 0) {
            console.log(`\n   ⚠️  Devices with issues:`);
            problems.forEach(([id, d]) => {
                const issue = d.conn && d.conn.ws && !d.isOnline ? 'Connected but not registered' :
                             d.isOnline && !d.cloudConnected ? 'No cloud connection' : 'Unknown issue';
                console.log(`      ${id} "${d.alias}": ${issue}`);
            });
        }
        
        console.log(`${'═'.repeat(80)}\n`);
    }

    /**
     * Get current status summary (for API or testing)
     */
    static getStatusSummary() {
        const online = Object.values(sONOFF).filter(d => d.isOnline).length;
        const total = Object.keys(sONOFF).length;
        const cloudConnected = Object.values(sONOFF).filter(d => d.cloudConnected).length;
        
        const problems = Object.entries(sONOFF)
            .filter(([id, d]) => 
                (d.conn && d.conn.ws && !d.isOnline) || 
                (d.isOnline && !d.cloudConnected)
            )
            .map(([id, d]) => ({
                deviceID: id,
                alias: d.alias,
                issue: d.conn && d.conn.ws && !d.isOnline ? 
                    'Connected but not registered' :
                    d.isOnline && !d.cloudConnected ? 
                    'No cloud connection' : 
                    'Unknown issue'
            }));

        return {
            online,
            total,
            cloudConnected,
            problems
        };
    }
}
