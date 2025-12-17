import https from 'https';

// Use the exact request from your logs
const deviceRequest = {
    "accept": "ws;2",
    "version": 2,
    "ts": 1534,
    "deviceid": "10000157ed",
    "apikey": "f360c6b3-61c1-49c6-90eb-c903b0a74015",
    "model": "ITA-GZ1-GL",
    "romVersion": "1.2.0"
};

const postData = JSON.stringify(deviceRequest);

const options = {
    hostname: 'eu-disp.coolkit.cc',
    port: 443,
    path: '/dispatch/device',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    },
    // Accept self-signed certs
    rejectUnauthorized: false
};

console.log('Sending request to REAL eWeLink server:');
console.log(JSON.stringify(deviceRequest, null, 2));
console.log('\n' + '='.repeat(80) + '\n');

const req = https.request(options, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    console.log('\n' + '='.repeat(80));
    console.log('RESPONSE FROM REAL SERVER:');
    console.log('='.repeat(80) + '\n');

    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
    });

    res.on('end', () => {
        console.log('Raw response:', body);
        try {
            const parsed = JSON.parse(body);
            console.log('\nParsed response:');
            console.log(JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log('Could not parse as JSON');
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('COMPARISON WITH YOUR PROXY:');
        console.log('='.repeat(80));
        const yourResponse = {
            "port": "8888",
            "reason": "ok",
            "IP": "192.168.1.11",
            "error": 0
        };
        console.log('\nYour proxy response:');
        console.log(JSON.stringify(yourResponse, null, 2));
        console.log('\nReal server response:');
        console.log(JSON.stringify(parsed, null, 2));
        console.log('\n' + '='.repeat(80));
    });
});

req.on('error', (e) => {
    console.error('Error:', e);
});

req.write(postData);
req.end();
