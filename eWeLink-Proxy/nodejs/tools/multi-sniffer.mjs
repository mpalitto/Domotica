import http from 'http';
import https from 'https';
import fs from 'fs';
import net from 'net';

// Update these with the paths you found earlier!
const certOptions = {
    key: fs.readFileSync('/root/WS/tls/matteo-key.pem'), 
    cert: fs.readFileSync('/root/WS/tls/matteo-cert.pem')
};

// 1. Logic to handle and print requests
const handleRequest = (req, res, protocol, port) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        const ip = req.socket.remoteAddress.replace('::ffff:', '');
        console.log(`\n[${new Date().toLocaleTimeString()}] 📥 ${protocol} Request on Port ${port}`);
        console.log(`   From: ${ip}`);
        console.log(`   Path: ${req.url}`);
        console.log(`   Body: ${body || '(empty)'}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 0, reason: "ok" }));
    });
};

// 2. The Servers
const plainHandler = (req, res) => handleRequest(req, res, '🔓 PLAIN HTTP', 8081);
const secureHandler = (req, res) => handleRequest(req, res, '🔐 SECURE HTTPS', req.socket.localPort);

const plainServer = http.createServer(plainHandler);
const secureServer = https.createServer(certOptions, secureHandler);

// 3. Port 8081 - The Hybrid Listener (TCP Proxy)
const hybrid8081 = net.createServer((socket) => {
    socket.once('data', (buffer) => {
        const isTLS = buffer[0] === 0x16; // Check for TLS handshake
        const target = isTLS ? secureServer : plainServer;
        target.emit('connection', socket);
        socket.push(buffer);
    });
});

// 4. Port 443 - Pure HTTPS
const https443 = https.createServer(certOptions, secureHandler);

// Start listening
hybrid8081.listen(8081, () => console.log('🚀 Listening on 8081 (HTTP/HTTPS Hybrid)'));
https443.listen(443, () => console.log('🚀 Listening on 443 (HTTPS Only)'));
