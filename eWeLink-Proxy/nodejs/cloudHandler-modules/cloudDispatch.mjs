/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudDispatch.mjs
Handles cloud server discovery via dispatch
*/

import https from 'https';
import { sONOFF, proxyEvent } from '../sharedVARs.js';
import { CloudLogger } from './cloudLogger.mjs';
import { CLOUD_CONFIG } from './cloudConfig.mjs';

export class CloudDispatch {
    /**
     * Get cloud server information via dispatch
     */
    static getCloudServer(deviceID, onSuccess, onError) {
        CloudLogger.log('📡 GETTING CLOUD DISPATCH', {
            deviceID,
            dispatchUrl: CLOUD_CONFIG.DISPATCH_URL
        });
        
        console.log(`📡 Getting cloud dispatch for device ${deviceID}...`);
        
        // Get device's apikey
        const apikey = sONOFF[deviceID].conn.apikey;
        
        const postData = JSON.stringify({
            accept: 'ws',
            version: CLOUD_CONFIG.DEFAULT_VERSION,
            ts: Math.floor(Date.now() / 1000),
            deviceid: deviceID,
            apikey: apikey,
            model: CLOUD_CONFIG.DEFAULT_MODEL,
            romVersion: CLOUD_CONFIG.DEFAULT_ROM_VERSION,
            imei: deviceID
        });
        
        CloudLogger.log('📤 Dispatch request data', JSON.parse(postData));
        
        const options = {
            hostname: CLOUD_CONFIG.DISPATCH_HOSTNAME,
            port: 443,
            path: '/dispatch/device',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            rejectUnauthorized: false
        };
        
        CloudLogger.log('🔧 HTTPS request options', options);
        
        const req = https.request(options, (res) => {
            CloudLogger.log('📥 CLOUD DISPATCH RESPONSE', {
                statusCode: res.statusCode,
                headers: res.headers
            });
            
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            
            res.on('end', () => {
                CloudLogger.log('📩 Dispatch response body', body);
                
                try {
                    const response = JSON.parse(body);
                    
                    if (response.error === 0) {
                        const cloudUrl = `wss://${response.IP}:${response.port}/api/ws`;
                        
                        CloudLogger.log('✅ Dispatch successful', {
                            cloudIP: response.IP,
                            cloudPort: response.port,
                            cloudUrl: cloudUrl
                        });
                        
                        console.log(`✅ Cloud dispatch successful for ${deviceID}`);
                        console.log(`   Cloud server: ${response.IP}:${response.port}`);
                        
                        if (onSuccess) {
                            onSuccess(cloudUrl);
                        }
                    } else {
                        CloudLogger.log('❌ Dispatch error', {
                            deviceID,
                            errorCode: response.error,
                            response: response
                        });
                        
                        console.log('❌ Dispatch error for device', deviceID);
                        console.log('   Error code:', response.error);
                        console.log('   Response:', response);
                        
                        if (onError) {
                            onError(`Dispatch error: ${response.error}`);
                        }
                        
                        proxyEvent.emit('cloudConnectionFailed', deviceID, `Dispatch error: ${response.error}`);
                    }
                } catch (err) {
                    CloudLogger.log('❌ Error parsing dispatch response', {
                        error: err.message,
                        stack: err.stack,
                        rawBody: body
                    });
                    
                    console.log('❌ Error parsing cloud dispatch response:', err);
                    
                    if (onError) {
                        onError(`Parse error: ${err.message}`);
                    }
                    
                    proxyEvent.emit('cloudConnectionFailed', deviceID, `Parse error: ${err.message}`);
                }
            });
        });
        
        req.on('error', (err) => {
            CloudLogger.log('❌ HTTPS REQUEST ERROR', {
                deviceID,
                error: err.message,
                code: err.code,
                stack: err.stack
            });
            
            console.log('❌ Error getting cloud dispatch for device', deviceID, ':', err.message);
            console.log('💡 Check /etc/hosts or DNS configuration');
            
            if (onError) {
                onError(`Dispatch request error: ${err.message}`);
            }
            
            proxyEvent.emit('cloudConnectionFailed', deviceID, `Dispatch request error: ${err.message}`);
        });
        
        req.on('timeout', () => {
            CloudLogger.log('⏱️ HTTPS request timeout', { deviceID });
            console.log('⏱️ HTTPS request timeout for device', deviceID);
            req.destroy();
            
            if (onError) {
                onError('Dispatch timeout');
            }
            
            proxyEvent.emit('cloudConnectionFailed', deviceID, 'Dispatch timeout');
        });
        
        req.setTimeout(CLOUD_CONFIG.HTTPS_TIMEOUT_MS);
        
        req.write(postData);
        req.end();
        
        CloudLogger.log('📨 Dispatch request sent, waiting for response...');
    }
}
