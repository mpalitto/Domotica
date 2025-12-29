import { createServer } from 'net';

const PORT = 8081;

const server = createServer((socket) => {
    const clientIP = socket.remoteAddress.replace('::ffff:', '');
    
    socket.once('data', (data) => {
        console.log(`\n--- [${new Date().toLocaleTimeString()}] Connection from ${clientIP} ---`);
        
        // Check if it's TLS (Handshake starts with 0x16)
        if (data[0] === 0x16) {
            console.log(`🔒 Type: ENCRYPTED (HTTPS/TLS)`);
            console.log(`Hex Header: ${data.slice(0, 5).toString('hex')}...`);
        } else {
            console.log(`🔓 Type: PLAIN TEXT (HTTP)`);
            console.log(`Content:\n${data.toString()}`);
        }
        
        // Close the socket to let the device try again later
        socket.end();
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Raw Protocol Logger listening on ${PORT}`);
    console.log(`Watching for both Encrypted and Plain traffic...`);
});
