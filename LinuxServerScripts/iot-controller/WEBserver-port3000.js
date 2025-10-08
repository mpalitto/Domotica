const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

// Use __dirname to save in the same directory as server.js
const MAP_CONFIG_PATH = path.join(__dirname, 'map-conf.json');
const SONOFF_LIST_PATH = '/root/sONOFF.list';

// Cache for parsed configuration
let cachedConfig = null;

// Parse sONOFF.list file
async function parseSONOFFList() {
    try {
        const content = await fs.readFile(SONOFF_LIST_PATH, 'utf-8');
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
            
            // Parse light entries (V s:CODE # NAME)
            const match = line.match(/^V s:([A-F0-9]+) # (.+?)(?:\s+-|$)/);
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

// Initialize configuration on startup
async function initializeConfig() {
    console.log('Loading configuration from', SONOFF_LIST_PATH);
    cachedConfig = await parseSONOFFList();
    console.log('Configuration loaded successfully');
}

app.use(bodyParser.json());
app.use(express.static('.'));

// API Endpoints
app.get('/api/config', async (req, res) => {
    if (!cachedConfig) {
        cachedConfig = await parseSONOFFList();
    }
    res.json(cachedConfig);
});

// Save entire map configuration (house + rooms + lights + furniture) to map-conf.json
app.post('/api/house-map', async (req, res) => {
    try {
        await fs.writeFile(MAP_CONFIG_PATH, JSON.stringify(req.body, null, 2));
        res.json({ success: true, message: 'House map saved to map-conf.json' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Load entire map configuration from map-conf.json
app.get('/api/house-map', async (req, res) => {
    try {
        const data = await fs.readFile(MAP_CONFIG_PATH, 'utf-8');
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
            const data = await fs.readFile(MAP_CONFIG_PATH, 'utf-8');
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
        await fs.writeFile(MAP_CONFIG_PATH, JSON.stringify(mapData, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Load room configuration (from map-conf.json)
app.get('/api/room/:roomId', async (req, res) => {
    try {
        const data = await fs.readFile(MAP_CONFIG_PATH, 'utf-8');
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

app.post('/api/light/toggle', async (req, res) => {
    const { code } = req.body;
    const command = `screen -S arduino433tx -X stuff "s:${code}"`;
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('Error executing command:', error);
            res.json({ success: false, error: error.message });
        } else {
            console.log(`Light command sent: s:${code}`);
            res.json({ success: true });
        }
    });
});

// Initialize and start server
initializeConfig().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`IoT House Controller running on http://192.168.1.77:${PORT}`);
        console.log(`Map configuration file: ${MAP_CONFIG_PATH}`);
    });
}).catch(error => {
    console.error('Failed to initialize:', error);
    process.exit(1);
});