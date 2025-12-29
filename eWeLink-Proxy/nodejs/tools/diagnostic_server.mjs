import { createServer } from 'https';
import { readFileSync } from 'fs';

// Configuration - matches your paths
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || '/root/WS/tls/matteo-key.pem';
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || '/root/WS/tls/matteo-cert.pem';


const tlsOptions = {
    key: readFileSync(TLS_KEY_PATH),
    cert: readFileSync(TLS_CERT_PATH),
    minVersion: 'TLSv1', // This allows TLS 1.0, 1.1, and 1.2
    ciphers: 'DEFAULT:@SECLEVEL=0' // Lowers the security level to allow old ciphers
};

const server = createServer(tlsOptions, (req, res) => {
    const clientIP = req.socket.remoteAddress.replace('::ffff:', '');
    let body = '';

    req.on('data', chunk => { body += chunk; });
    
    req.on('end', () => {
        console.log(`\n--- [${new Date().toLocaleTimeString()}] ---`);
        console.log(`📡 DISPATCH REQUEST RECEIVED`);
        console.log(`From IP: ${clientIP}`);
        console.log(`Method:  ${req.method}`);
        console.log(`URL:     ${req.url}`);
        
        if (body) {
            try {
                const json = JSON.parse(body);
                console.log(`Payload:`, JSON.stringify(json, null, 2));
                
                // Check if they support SSL
                const sslSupport = json.ssl ? "YES" : "NO/NOT SPECIFIED";
                console.log(`Device reports SSL support: ${sslSupport}`);
                console.log(`Device Version: ${json.version || 'Unknown'}`);
            } catch (e) {
                console.log(`Payload (Raw): ${body}`);
            }
        }

        // Send a dummy response so the device doesn't error out immediately
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 0,
            reason: "diagnostic_mode",
            IP: "192.168.1.11",
            port: 8081
        }));
    });
});

server.on('tlsClientError', (err, socket) => {
    console.error(`❌ TLS Client Error: ${err.message}`);
});

// Also catch general server errors
server.on('error', (err) => {
    console.error(`❌ Server Error: ${err.stack}`);
});

const PORT = 443;
server.listen(PORT, () => {
    console.log(`🚀 Diagnostic Server listening on Port ${PORT}`);
    console.log(`Waiting for devices to check in...`);
});
