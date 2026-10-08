const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

/* ================= CONFIG ================= */

// Root of LinuxServerScripts ($IoTserverScripts, exported by rc.local / startIoT-WEBui.sh)
const BASE_DIR = process.env.IoTserverScripts || path.resolve(__dirname, '..');

// House layout (rooms + placed lights + furniture) edited from the web UI
const MAP_CONFIG_PATH = path.join(__dirname, 'map-conf.json');

// RFcode -> name -> area catalogue, the "Available Lights" sidebar list
const SONOFF_LIST_CANDIDATES = [
    path.join(BASE_DIR, 'sONOFF.list'),
    path.join(BASE_DIR, 'button2sONOFF/config/sONOFF.list')
];

// RFcode <-> deviceID mapping. The web UI speaks RF codes, the eWeLink proxy
// speaks deviceIDs, so this file is the join table used to read live state.
const SONOFF_CONFIG_PATH = path.join(BASE_DIR, 'button2sONOFF/config/sONOFF.config');

// The eWeLink proxy is the live source of truth for switch state: a physical
// button press, the eWeLink app or the RF receiver all end up reported there.
const EWELINK_PROXY_HOST = process.env.EWELINK_PROXY_HOST || '192.168.1.11';
const EWELINK_PROXY_PORT = parseInt(process.env.EWELINK_PROXY_PORT || '3000', 10);

// How often to pull /devices from the proxy and diff it against the last snapshot
const STATE_POLL_MS = parseInt(process.env.STATE_POLL_MS || '2000', 10);

// How often to re-check sONOFF.list / sONOFF.config for edits made outside the UI
const CONFIG_CHECK_MS = 30000;

// Cache for parsed configuration
let cachedConfig = null;
let sONOFFlist = null;

/* ================= SONOFF STATE (live) ================= */

const deviceByCode = Object.create(null);   // RFcode -> { deviceID, alias }
const codeByDevice = Object.create(null);    // deviceID -> RFcode
const stateByCode = Object.create(null);     // RFcode -> 'ON' | 'OFF'
const onlineByCode = Object.create(null);    // RFcode -> bool

let lastStateFetch = null;                   // ISO timestamp of the last good poll
let statePollError = null;                   // last poll failure, cleared on success

// sONOFF.config: "deviceID : alias : RFcode : description" (// comments, deviceID may be empty)
function parseSONOFFConfig(content) {
    for (const key of Object.keys(deviceByCode)) delete deviceByCode[key];
    for (const key of Object.keys(codeByDevice)) delete codeByDevice[key];

    content.split('\n')
        .map(line => line.replace(/\/\/.*$/, '').trim())
        .filter(Boolean)
        .forEach(line => {
            const [deviceID, alias, rfCode] = line.split(':').map(s => s.trim());
            if (!alias || !rfCode) return;

            deviceByCode[rfCode] = { deviceID: deviceID || null, alias };
            if (deviceID) codeByDevice[deviceID] = rfCode;
        });
}

// Only re-parse a config file when its mtime actually moved
const fileMtime = Object.create(null);

function reloadIfChanged(file, loader) {
    let mtime;
    try {
        mtime = fs.statSync(file).mtimeMs;
    } catch {
        return false;
    }

    if (fileMtime[file] === mtime) return false;
    fileMtime[file] = mtime;
    loader();
    return true;
}

// Initial load: read the file and remember its mtime, so the watcher below does
// not immediately report a change that nobody made.
function loadTrackedFile(file, loader) {
    try {
        fileMtime[file] = fs.statSync(file).mtimeMs;
    } catch {
        // missing file: let loader() produce the error message
    }
    loader();
}

/* ================= CONFIGURATION ================= */

// Parse sONOFF.list file
function parseSONOFFList() {
    try {
        const content = fs.readFileSync(sONOFFlist, 'utf-8');
        const lines = content.split('\n');
        const areas = {};
        let currentArea = null;

        for (const line of lines) {
            // Detect area headers
            if (line.includes('# SALA/CUCINA')) currentArea = 'SALA/CUCINA';
            else if (line.includes('# PADRONALE')) currentArea = 'PADRONALE';
            else if (line.includes('# NICOLO')) currentArea = 'NICOLO';
            else if (line.includes('# LAVANDERIA')) currentArea = 'LAVANDERIA';
            else if (line.includes('# BILOCALE')) currentArea = 'BILOCALE';
            else if (line.includes('# TERRAZZO')) currentArea = 'TERRAZZO';

            // Parse light entries (V s:CODE #name - description).
            // The name is terminated by whitespace + '-', everything after that
            // is free-form description text.
            const match = line.match(/^V s:([A-F0-9]+)\s+#\s*(.+?)(?:\s+-|$)/);
            if (match && currentArea) {
                if (!areas[currentArea]) areas[currentArea] = [];
                areas[currentArea].push({
                    code: match[1],
                    name: match[2].trim()
                });
            }
        }

        console.log('Parsed areas:', Object.keys(areas));
        Object.keys(areas).forEach(area => {
            console.log(`  ${area}: ${areas[area].length} lights`);
        });

        return { areas };
    } catch (error) {
        console.error('Error parsing sONOFF.list:', error);
        return { areas: {} };
    }
}

function loadConfig() {
    console.log('Loading configuration from', sONOFFlist);
    cachedConfig = parseSONOFFList();
    console.log('Configuration loaded successfully');
}

function loadDeviceMap() {
    console.log('Loading RF code map from', SONOFF_CONFIG_PATH);
    parseSONOFFConfig(fs.readFileSync(SONOFF_CONFIG_PATH, 'utf-8'));
    console.log(`Configuration loaded: ${Object.keys(deviceByCode).length} lights, `
        + `${Object.keys(codeByDevice).length} with a known deviceID`);
}

/* ================= STATE PUSH (SSE) ================= */

// A correction pushed from the UI holds for OVERRIDE_MS before the proxy poll
// is allowed to overwrite it again: it covers the round trip to the eWeLink
// proxy and keeps the value visible if that round trip fails.
const OVERRIDE_MS = 10000;
const stateOverrides = {};


const sseClients = new Set();

function stateSnapshot() {
    const devices = {};

    for (const [code, entry] of Object.entries(deviceByCode)) {
        devices[code] = {
            alias: entry.alias,
            deviceID: entry.deviceID,
            state: stateByCode[code] || null,
            online: onlineByCode[code] !== undefined ? onlineByCode[code] : null
        };
    }

    return {
        ts: lastStateFetch,
        source: `${EWELINK_PROXY_HOST}:${EWELINK_PROXY_PORT}`,
        error: statePollError,
        codes: { ...stateByCode },
        devices
    };
}

function broadcastStates() {
    if (sseClients.size === 0) return;

    const payload = JSON.stringify(stateSnapshot());
    for (const res of sseClients) {
        try {
            res.write(`event: states\ndata: ${payload}\n\n`);
        } catch {
            sseClients.delete(res);   // gone client, drop it
        }
    }
}

// Ask the proxy for the authoritative switch state of every device it knows
function fetchDevices() {
    return new Promise((resolve, reject) => {
        const req = http.get(
            {
                host: EWELINK_PROXY_HOST,
                port: EWELINK_PROXY_PORT,
                path: '/devices',
                timeout: 5000
            },
            res => {
                let body = '';
                res.setEncoding('utf-8');
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`proxy replied ${res.statusCode}`));
                    }
                    try {
                        resolve(JSON.parse(body));
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        req.on('timeout', () => req.destroy(new Error('proxy timeout')));
        req.on('error', reject);
    });
}

function applyDevices(devices) {
    for (const key of Object.keys(onlineByCode)) delete onlineByCode[key];

    const now = Date.now();
    const reported = new Set();
    for (const dev of devices) {
        const code = codeByDevice[dev.deviceid];
        if (!code) continue;   // device is not mapped to a light in sONOFF.config

        reported.add(code);
        const sw = dev.params && dev.params.switch;
        if (sw === 'on' || sw === 'off') {
            if (stateOverrides[code] && (now - stateOverrides[code]) < OVERRIDE_MS) {
                // keep local override
            } else {
                stateByCode[code] = sw.toUpperCase();
            }
        }
        onlineByCode[code] = !!(dev.localOnline || dev.cloudOnline);
    }

    // Drop codes the proxy no longer reports (device gone, sONOFF.config edited),
    // so a light that lost its mapping falls back to its stored state instead of
    // showing a frozen "live" state forever.
    for (const code of Object.keys(stateByCode)) {
        if (!reported.has(code)) {
            delete stateByCode[code];
            delete stateOverrides[code];
        }
    }
}

let lastSignature = null;

async function pollSonoffStates() {
    try {
        const devices = await fetchDevices();

        // An empty list means the proxy is still starting up, not that every
        // light vanished. Keep the last known state instead of blanking the UI.
        if (!Array.isArray(devices) || devices.length === 0) {
            throw new Error('proxy returned no devices');
        }

        applyDevices(devices);
        lastStateFetch = new Date().toISOString();
        statePollError = null;

        // Only wake the browsers when something actually moved
        const signature = JSON.stringify(stateByCode);
        if (signature === lastSignature) return;

        lastSignature = signature;
        console.log(`[states] ${Object.keys(stateByCode).length} lights reporting, `
            + `pushed to ${sseClients.size} client(s)`);
        broadcastStates();
    } catch (error) {
        // Log only on transition, otherwise a down proxy spams the log every poll
        if (statePollError !== error.message) {
            statePollError = error.message;
            console.error(`[states] eWeLink proxy ${EWELINK_PROXY_HOST}:${EWELINK_PROXY_PORT} `
                + `unreachable - ${error.message}`);
        }
    }
}

/* ================= API ================= */

app.use(bodyParser.json());
app.use(express.static(__dirname));

// API Endpoints
app.get('/api/config', (req, res) => {
    res.json(cachedConfig || { areas: {} });
});

// Snapshot of every known light: used for the first paint and as a polling fallback
app.get('/api/states', (req, res) => {
    res.json(stateSnapshot());
});

// Live push: the browser subscribes here and gets a full snapshot on connect,
// then a new snapshot every time any sonoff switch state changes.
app.get('/api/states/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    sseClients.add(res);
    res.write('event: states\n');
    res.write(`data: ${JSON.stringify(stateSnapshot())}\n\n`);

    // Keep intermediaries from closing an idle stream
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);

    req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(res);
    });
});

// Save entire map configuration (house + rooms + lights + furniture) to map-conf.json
app.post('/api/house-map', async (req, res) => {
    try {
        await fs.promises.writeFile(MAP_CONFIG_PATH, JSON.stringify(req.body, null, 2));
        res.json({ success: true, message: 'House map saved to map-conf.json' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Load entire map configuration from map-conf.json
app.get('/api/house-map', async (req, res) => {
    try {
        const data = await fs.promises.readFile(MAP_CONFIG_PATH, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.json(null);
    }
});

// Save room configuration (updates the specific room in map-conf.json)
app.post('/api/room/:roomId', async (req, res) => {
    try {
        let mapData = { rooms: [] };

        // Load existing map configuration
        try {
            const data = await fs.promises.readFile(MAP_CONFIG_PATH, 'utf-8');
            mapData = JSON.parse(data);
        } catch (error) {
            // File doesn't exist yet, use empty structure
        }

        // Find and update the specific room
        const roomIndex = mapData.rooms.findIndex(r => r.id.toString() === req.params.roomId);
        if (roomIndex >= 0) {
            // Merge the lights and furniture configuration into the existing room
            mapData.rooms[roomIndex] = {
                ...mapData.rooms[roomIndex],
                lights: req.body.lights || [],
                furniture: req.body.furniture || []
            };
        }

        // Save back to map-conf.json
        await fs.promises.writeFile(MAP_CONFIG_PATH, JSON.stringify(mapData, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Load room configuration (from map-conf.json)
app.get('/api/room/:roomId', async (req, res) => {
    try {
        const data = await fs.promises.readFile(MAP_CONFIG_PATH, 'utf-8');
        const mapData = JSON.parse(data);
        const room = mapData.rooms.find(r => r.id.toString() === req.params.roomId);

        if (room) {
            res.json({
                lights: room.lights || [],
                furniture: room.furniture || []
            });
        } else {
            res.json({ lights: [], furniture: [] });
        }
    } catch (error) {
        res.json({ lights: [], furniture: [] });
    }
});

/* ================= STATE SYNC HELPERS ================= */

function normalizeSwitch(v) {
    return typeof v === 'string' && /^(on|off)$/i.test(v) ? v.toUpperCase() : null;
}

const hasState = code => Object.prototype.hasOwnProperty.call(stateByCode, code);

// Push a switch state correction to managerLayer, which owns the logical button
// state and relays the change to the eWeLink proxy (see managerLayer.js).
function sendStateToManagerLayer(code, state) {
    try {
        const entry = deviceByCode[code.toUpperCase()];
        if (!entry || !entry.deviceID) return;
        const client = net.createConnection({ host: '127.0.0.1', port: 7777 }, () => {
            client.write(`STATE_UPDATE ${entry.deviceID} ${state.toUpperCase()}\n`);
            client.end();
        });
        client.on('error', () => { client.destroy(); });
        setTimeout(() => { if (client && !client.destroyed) client.end(); }, 1000);
    } catch (e) {}
}

// Record a switch state locally and push it everywhere it matters: the SSE
// clients, then managerLayer (which relays it to the eWeLink proxy so the next
// poll keeps this value instead of reverting it).
function applyStateUpdate(code, st) {
    stateByCode[code] = st;
    stateOverrides[code] = Date.now();
    lastStateFetch = new Date().toISOString();
    lastSignature = JSON.stringify(stateByCode);
    broadcastStates();
    try { sendStateToManagerLayer(code, st); } catch (e) {}
}

app.post('/api/light/toggle', (req, res) => {
    const { code, state } = req.body;

    // The code goes into a shell command below, so only accept RF codes
    if (typeof code !== 'string' || !/^[0-9A-F]{4,8}$/i.test(code)) {
        return res.status(400).json({ success: false, error: 'invalid light code' });
    }
    const c = code.toUpperCase();

    exec(`screen -S arduino433tx -X stuff "s:${c}"`, (error) => {
        if (error) {
            console.error('Error executing command:', error);
            res.json({ success: false, error: error.message });
            return;
        }
        console.log(`Light command sent: s:${c}`);
        // Keep the eWeLink state and the web UI in sync with what was just
        // commanded: record the expected switch state and push it to
        // managerLayer, which relays it to the eWeLink proxy (and from there
        // to the cloud bridge). Locally online devices report their real state
        // on their own anyway, so any mismatch self-corrects on the next poll;
        // RF-fallback (offline) devices have no way to report, so this is the
        // only thing that keeps the UI and the eWeLink record honest.
        const expected = normalizeSwitch(state);
        if (expected && hasState(c)) {
            applyStateUpdate(c, expected);
        }
        res.json({ success: true, code: c });
    });
});

app.post('/api/state/update', (req, res) => {
    const { code, state } = req.body;
    if (typeof code !== 'string' || !/^[0-9A-F]{4,8}$/i.test(code)) {
        return res.status(400).json({ success: false, error: 'invalid light code' });
    }
    const st = normalizeSwitch(state);
    if (!st) {
        return res.status(400).json({ success: false, error: 'invalid state' });
    }
    const c = code.toUpperCase();
    // Only lights the proxy reports have an eWeLink state to correct. Codes
    // without a deviceID (RF-only lights) are tracked by the room map only.
    if (!hasState(c)) {
        return res.status(404).json({ success: false, error: 'unknown light' });
    }
    applyStateUpdate(c, st);
    res.json({ success: true, code: c, state: st });
});

/* ================= MAIN ================= */

function resolveSONOFFList() {
    sONOFFlist = SONOFF_LIST_CANDIDATES.find(candidate => fs.existsSync(candidate)) || SONOFF_LIST_CANDIDATES[0];
}

function watchConfigFiles() {
    setInterval(() => {
        let changed = false;

        if (reloadIfChanged(SONOFF_CONFIG_PATH, loadDeviceMap)) {
            console.log('[config] sONOFF.config changed');
            changed = true;
        }

        if (reloadIfChanged(sONOFFlist, loadConfig)) {
            console.log('[config] sONOFF.list changed');
            changed = true;
        }

        // Re-derive which lights the proxy reports, then repaint the browsers
        if (changed) {
            pollSonoffStates();
        }
    }, CONFIG_CHECK_MS);
}

async function main() {
    resolveSONOFFList();
    loadTrackedFile(sONOFFlist, loadConfig);

    try {
        loadTrackedFile(SONOFF_CONFIG_PATH, loadDeviceMap);
    } catch (error) {
        console.error('Error parsing sONOFF.config, live state will be unavailable:', error.message);
    }

    watchConfigFiles();

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`IoT House Controller running on http://192.168.1.77:${PORT}`);
        console.log(`Map configuration file: ${MAP_CONFIG_PATH}`);
        console.log(`Live sonoff state from ${EWELINK_PROXY_HOST}:${EWELINK_PROXY_PORT} `
            + `every ${STATE_POLL_MS}ms -> /api/states/stream`);
    });

    // Fetch the initial state immediately, then keep polling
    pollSonoffStates();
    setInterval(pollSonoffStates, STATE_POLL_MS);
}

main().catch(error => {
    console.error('Failed to start:', error);
    process.exit(1);
});