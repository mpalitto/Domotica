// Search in the LAN for all devices with the service type _ewelink._tcp through the DNS PTR record.
// Get the Hostname and Port of device service via parsing out the device DNS SRV record. (The default port is 8081)
// Get device IP address via DNS A record or by other means.
// Get the info of “device ID”, “Service Type”, “device API interface version” and “device information” via parsing out the device DNS TXT Record.
const dns = require('dns');

const serviceType = '_ewelink._tcp';

// Function to perform DNS PTR query to find devices with the specified service type
function discoverDevicesWithServiceType(serviceType) {
    return new Promise((resolve, reject) => {
        console.log('Searching for devices with service type', serviceType);
        // initiates a DNS PTR query to discover devices with the specified service type (_ewelink._tcp). 
        // It sends a request to the DNS server to resolve the PTR record associated with the specified service type.
        dns.resolvePtr(serviceType, (err, addresses) => {
            if (err) {
                reject(err);
            } else {
                console.log('Discovered devices:', addresses);
                resolve(addresses);
            }
        });
    });
}

// Function to get device information using DNS SRV, A, and TXT records
async function getDeviceInfo(deviceHostname) {
    console.log('Getting information for device:', deviceHostname);

    // DNS SRV query to retrieve service information for the discovered device.
    const srvRecords = await new Promise((resolve, reject) => {
        dns.resolveSrv(deviceHostname, (err, records) => {
            if (err) {
                reject(err);
            } else {
                console.log('SRV Records:', records);
                resolve(records);
            }
        });
    });

    // A records (IPv4 addresses) associated with the device's hostname to retrieve its IP address.
    const aRecords = await new Promise((resolve, reject) => {
        dns.resolve4(deviceHostname, (err, addresses) => {
            if (err) {
                reject(err);
            } else {
                console.log('A Records:', addresses);
                resolve(addresses);
            }
        });
    });

    // TXT records associated with the device's hostname to extract additional information such as device ID, service type, API version, and device information.
    const txtRecords = await new Promise((resolve, reject) => {
        dns.resolveTxt(deviceHostname, (err, records) => {
            if (err) {
                reject(err);
            } else {
                console.log('TXT Records:', records);
                resolve(records);
            }
        });
    });

    const deviceInfo = {
        hostname: deviceHostname,
        port: srvRecords[0]?.port || 8081, // Default port is 8081
        ipAddress: aRecords[0],
        deviceID: txtRecords[0]?.find(entry => entry.startsWith('deviceID='))?.split('=')[1],
        serviceType: txtRecords[0]?.find(entry => entry.startsWith('serviceType='))?.split('=')[1],
        apiVersion: txtRecords[0]?.find(entry => entry.startsWith('apiVersion='))?.split('=')[1],
        deviceInfo: txtRecords[0]?.find(entry => entry.startsWith('deviceInfo='))?.split('=')[1]
    };

    console.log('Device Information:', deviceInfo);
    return deviceInfo;
}

// Usage: Discover devices with the specified service type and get device information
discoverDevicesWithServiceType(serviceType)
    .then(async devices => {
        for (const device of devices) {
            const deviceInfo = await getDeviceInfo(device);
            console.log('--------------------------------------------------');
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });

// the DNS queries are initiated by calling functions from the dns module, specifically dns.resolvePtr, dns.resolveSrv, dns.resolve4, and dns.resolveTxt.

// DNS PTR query to discover devices with the specified service type (_ewelink._tcp). It sends a request to the DNS server to resolve the PTR record associated with the specified service type.

// DNS SRV query to retrieve service information for the discovered device.
// A records (IPv4 addresses) associated with the device's hostname to retrieve its IP address.
// TXT records associated with the device's hostname to extract additional information such as device ID, service type, API version, and device information.
// These functions (resolvePtr, resolveSrv, resolve4, resolveTxt) are asynchronous and send DNS queries to the DNS server to retrieve the respective records needed for device discovery and information extraction.