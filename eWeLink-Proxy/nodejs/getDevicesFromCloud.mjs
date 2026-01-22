// ewelinkCloud.mjs

import https from 'https';
import { URL } from 'url';

const APP_ID = 'YwLWIjK2pB6f1pEh5qQh5fC4c2wK5eG6';
const APP_SECRET = 'rTeBXe9Xg3uN4pW6mK8qQvT7uY9zP3cD';

// Change this if your account is in a different region: 'us', 'as', 'eu'
const REGION = 'eu';

let accessToken = null;
const deviceKeyMap = new Map(); // deviceId -> devicekey

// Helper: Simple HTTPS POST request returning parsed JSON
function httpsPost(url, path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Helper: Simple HTTPS GET request
function httpsGet(url, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path,
      method: 'GET',
      headers,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

export async function login(email, password, areaCode = '+39') {
  const baseUrl = new URL(`https://${REGION}-api.coolkit.cc:8080`);

  const payload = JSON.stringify({
    appId: APP_ID,
    appSecret: APP_SECRET,
    account: email,
    password,
    areaCode,
    countryCode: areaCode,
  });

  const response = await httpsPost(baseUrl, '/api/v2/user/login', payload);

  if (response.error !== 0) {
    throw new Error(`Login failed: ${response.msg || JSON.stringify(response)}`);
  }

  accessToken = response.data.at;
  console.log('Successfully logged in to eWeLink cloud');
}

export async function fetchAllDeviceKeys() {
  if (!accessToken) {
    throw new Error('You must login first');
  }

  const baseUrl = new URL(`https://${REGION}-api.coolkit.cc:8080`);
  let beginIndex = 0;
  const num = 50;

  deviceKeyMap.clear();

  while (true) {
    const path = `/api/v2/device/thing?lang=en&num=${num}&beginIndex=${beginIndex}`;
    const response = await httpsGet(baseUrl, path, {
      Authorization: `Bearer ${accessToken}`,
    });

    if (response.error !== 0) {
      throw new Error(`Failed to fetch devices: ${response.msg || JSON.stringify(response)}`);
    }

    const things = response.data?.thingList || [];
    for (const thing of things) {
      const item = thing.itemData || thing;
      if (item.deviceid && item.key) {
        deviceKeyMap.set(item.deviceid, item.key);
        console.log(`Device key fetched: ${item.deviceid} (${item.name || 'No name'})`);
      }
    }

    if (things.length < num) break; // Last page
    beginIndex += num;
  }

  console.log(`Total device keys fetched: ${deviceKeyMap.size}`);
}

export async function initCloud(email, password) {
  await login(email, password);
  await fetchAllDeviceKeys();
}

export function getDeviceKey(deviceId) {
  return deviceKeyMap.get(deviceId);
}

export { deviceKeyMap }; // Optional: for debugging or inspection

const EWELINK_EMAIL = process.env.EWELINK_EMAIL || 'mpalitto@gmail.com';
const EWELINK_PASSWORD = process.env.EWELINK_PASSWORD || 'oettam68';

(async () => {
  try {
    await initCloud(EWELINK_EMAIL, EWELINK_PASSWORD);
    console.log('eWeLink cloud initialized and device keys ready for local control');
    // Start your proxy server or mDNS discovery here
  } catch (err) {
    console.error('Failed to initialize eWeLink cloud:', err.message);
  }
})();
