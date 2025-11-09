import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import WebSocket from 'ws';
import fs from 'fs';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 8080;

let ws = null;
let isConnected = false;
let devices = [];

// Store device power modes since the Eufy API no longer provides this info (removed in schema 13+)
let devicePowerModes = {};

// Store SSE clients for real-time motion updates
let sseClients = [];

// Store current motion detection states
let motionStates = {};

// Store last known PIR event timestamps for motion sensors
let lastPirEventTimestamps = {};
let motionSensorPollingInterval = null;

// Motion-triggered mode switching state
let motionTriggeredModeActive = false;
let motionTriggeredTimeout = null;
let previousCameraModes = {};
const MOTION_MODE_DURATION = 5 * 60 * 1000;

// Initialize default power modes for known devices
function initializeDevicePowerModes() {
    // Default to Optimal Surveillance mode (0) for all devices initially (this is the battery-saving mode)
    // This will be updated when we actually set or detect the modes
    devicePowerModes = {
        'T8113N63212153EF': 0, // Backyard - Optimal Surveillance (battery saving)
        'T8113N63212153E0': 0, // Shed - Optimal Surveillance (battery saving)
        'T8170T102427108A': 0, // Driveway - Optimal Surveillance (battery saving)
        'T8170T1024353ED4': 0, // Driveway Above View - Optimal Surveillance (battery saving)
    };
    console.log('Initialized device power modes (0=Surveillance/Battery, 2=Customized Recording):', devicePowerModes);
}

// Get stored power mode for a device
function getDevicePowerMode(serialNumber) {
    return devicePowerModes[serialNumber] || 0; // Default to Optimal Surveillance (battery saving)
}

// Set power mode for a device
function setDevicePowerMode(serialNumber, mode) {
    devicePowerModes[serialNumber] = mode;
    console.log(`Updated power mode for ${serialNumber} to ${mode}`);
    saveDevicePowerModesToCSV();
}

// CSV Logging Functions
const csvFilePath = join(__dirname, 'database', 'camera_transitions.csv');
const settingsFilePath = join(__dirname, 'database', 'settings.csv');

// Get the last transition timestamp from CSV
function getLastTransitionTimestamp() {
    try {
        if (!fs.existsSync(csvFilePath)) {
            return null;
        }

        const csvContent = fs.readFileSync(csvFilePath, 'utf8');
        const lines = csvContent.trim().split('\n');

        if (lines.length <= 1) { // Only header or empty
            return null;
        }

        // Get the last line and extract timestamp
        const lastLine = lines[lines.length - 1];
        const columns = lastLine.split(',');
        return columns[0] ? new Date(columns[0]) : null;
    } catch (error) {
        console.error('Error reading last transition timestamp:', error);
        return null;
    }
}

// Calculate hours since last transition
function calculateHoursSinceLastTransition() {
    const lastTimestamp = getLastTransitionTimestamp();
    if (!lastTimestamp) {
        return 'N/A'; // First transition
    }

    const now = new Date();
    const diffMs = now - lastTimestamp;
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.round(diffHours * 100) / 100; // Round to 2 decimal places
}

// Log transition to CSV
function logTransition(transitionData) {
    try {
        // Ensure CSV file exists with proper header
        if (!fs.existsSync(csvFilePath)) {
            const header = 'timestamp,date,time,transition_type,from_mode,to_mode,cameras_affected,hours_since_last_transition,notes\n';
            fs.writeFileSync(csvFilePath, header);
        }

        const now = new Date();
        const timestamp = now.toISOString();
        const date = now.toLocaleDateString();
        const time = now.toLocaleTimeString();
        const hoursSinceLastTransition = calculateHoursSinceLastTransition();

        // Escape any commas in the data by wrapping in quotes
        const escapeCSV = (value) => {
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        };

        const csvRow = [
            escapeCSV(timestamp),
            escapeCSV(date),
            escapeCSV(time),
            escapeCSV(transitionData.transitionType),
            escapeCSV(transitionData.fromMode),
            escapeCSV(transitionData.toMode),
            escapeCSV(transitionData.camerasAffected),
            escapeCSV(hoursSinceLastTransition),
            escapeCSV(transitionData.notes || '')
        ].join(',');

        // Append to CSV file with newline
        fs.appendFileSync(csvFilePath, csvRow + '\n');

        console.log(`✅ Logged transition to CSV: ${transitionData.transitionType} (${hoursSinceLastTransition}h since last)`);

        return {
            timestamp,
            date,
            time,
            hoursSinceLastTransition
        };
    } catch (error) {
        console.error('❌ Error logging transition to CSV:', error);
        return null;
    }
}

// Get mode name for logging
function getModeNameForLogging(mode) {
    switch (Number(mode)) {
        case 0: return 'Optimal Surveillance (Battery Saving)';
        case 2: return 'Customized Recording';
        default: return `Unknown(${mode})`;
    }
}

// Settings CSV Management Functions
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function loadSettingsFromCSV() {
    try {
        if (!fs.existsSync(settingsFilePath)) {
            console.log('Settings CSV not found, will create on first save');
            return null;
        }

        const csvContent = fs.readFileSync(settingsFilePath, 'utf8');
        const lines = csvContent.trim().split('\n');

        if (lines.length < 2) {
            console.log('Settings CSV is empty');
            return null;
        }

        const headers = parseCSVLine(lines[0]);
        const values = parseCSVLine(lines[1]);

        const settings = {};
        headers.forEach((header, index) => {
            const value = values[index];
            if (value !== undefined && value !== '') {
                if (value === 'true') settings[header] = true;
                else if (value === 'false') settings[header] = false;
                else if (!isNaN(value) && value !== '') settings[header] = Number(value);
                else settings[header] = value;
            }
        });

        console.log('Loaded settings from CSV:', settings);
        return settings;
    } catch (error) {
        console.error('Error loading settings from CSV:', error);
        return null;
    }
}

function saveSettingsToCSV(settings) {
    try {
        const databaseDir = join(__dirname, 'database');
        if (!fs.existsSync(databaseDir)) {
            fs.mkdirSync(databaseDir, { recursive: true });
        }

        const headers = Object.keys(settings).join(',');
        const values = Object.values(settings).map(v => {
            if (typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))) {
                return '"' + v.replace(/"/g, '""') + '"';
            }
            return v;
        }).join(',');

        const csvContent = `${headers}\n${values}\n`;
        fs.writeFileSync(settingsFilePath, csvContent);

        console.log('Saved settings to CSV:', settings);
        return true;
    } catch (error) {
        console.error('Error saving settings to CSV:', error);
        return false;
    }
}

function loadDevicePowerModesFromCSV() {
    try {
        const settings = loadSettingsFromCSV();
        if (!settings) return;

        Object.keys(settings).forEach(key => {
            if (key.startsWith('devicePowerMode_')) {
                const serialNumber = key.replace('devicePowerMode_', '');
                devicePowerModes[serialNumber] = settings[key];
            }
        });

        console.log('Loaded device power modes from CSV:', devicePowerModes);
    } catch (error) {
        console.error('Error loading device power modes from CSV:', error);
    }
}

function saveDevicePowerModesToCSV() {
    try {
        const settings = loadSettingsFromCSV() || {};

        Object.keys(devicePowerModes).forEach(serialNumber => {
            settings[`devicePowerMode_${serialNumber}`] = devicePowerModes[serialNumber];
        });

        saveSettingsToCSV(settings);
    } catch (error) {
        console.error('Error saving device power modes to CSV:', error);
    }
}

async function switchCamerasToCustomizedRecording(selectedCameras) {
    if (!ws || !isConnected) {
        console.error('Cannot switch cameras: not connected to Eufy service');
        return false;
    }

    try {
        const allDevices = await getAllDevices();
        let cameras = allDevices.filter(device => device.type === 'device' && device.category === 'camera');

        if (selectedCameras && Array.isArray(selectedCameras) && selectedCameras.length > 0) {
            cameras = cameras.filter(camera => selectedCameras.includes(camera.serialNumber));
        }

        if (cameras.length === 0) {
            console.log('No cameras to switch');
            return false;
        }

        console.log(`🎥 Motion detected! Switching ${cameras.length} cameras to Customized Recording mode...`);

        for (const camera of cameras) {
            const currentMode = getDevicePowerMode(camera.serialNumber);
            previousCameraModes[camera.serialNumber] = currentMode;

            if (currentMode !== 2) {
                try {
                    console.log(`   Setting power mode to Customized Recording (2)...`);
                    await new Promise((resolve, reject) => {
                        const messageHandler = (data) => {
                            const message = JSON.parse(data.toString());
                            if (message.messageId === `motion_set_power_${camera.serialNumber}_${requestId}`) {
                                ws.removeListener('message', messageHandler);
                                if (message.success) {
                                    resolve();
                                } else {
                                    reject(new Error(`Failed to set power mode for ${camera.serialNumber}`));
                                }
                            }
                        };

                        const requestId = Date.now();
                        ws.on('message', messageHandler);

                        const message = {
                            messageId: `motion_set_power_${camera.serialNumber}_${requestId}`,
                            command: 'device.set_property',
                            serialNumber: camera.serialNumber,
                            name: 'powerWorkingMode',
                            value: 2
                        };
                        ws.send(JSON.stringify(message));

                        setTimeout(() => {
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`Timeout setting power mode for ${camera.serialNumber}`));
                        }, 5000);
                    });

                    setDevicePowerMode(camera.serialNumber, 2);

                    console.log(`   Enabling All Other Motions...`);
                    await new Promise((resolve, reject) => {
                        const messageHandler = (data) => {
                            const message = JSON.parse(data.toString());
                            if (message.messageId === `motion_set_allmotion_${camera.serialNumber}_${requestId}`) {
                                ws.removeListener('message', messageHandler);
                                if (message.success) {
                                    resolve();
                                } else {
                                    reject(new Error(`Failed to set all other motions for ${camera.serialNumber}`));
                                }
                            }
                        };

                        const requestId = Date.now();
                        ws.on('message', messageHandler);

                        const message = {
                            messageId: `motion_set_allmotion_${camera.serialNumber}_${requestId}`,
                            command: 'device.set_property',
                            serialNumber: camera.serialNumber,
                            name: 'motionDetectionTypeAllOtherMotions',
                            value: true
                        };
                        ws.send(JSON.stringify(message));

                        setTimeout(() => {
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`Timeout setting all other motions for ${camera.serialNumber}`));
                        }, 5000);
                    });

                    console.log(`✅ ${camera.name}: Switched to Customized Recording with All Other Motions enabled (was mode ${currentMode})`);
                } catch (error) {
                    console.error(`❌ Error switching ${camera.name}:`, error.message);
                }
            } else {
                console.log(`ℹ️  ${camera.name}: Already in Customized Recording mode`);
            }
        }

        logTransition({
            transitionType: 'Motion-Triggered Auto Switch',
            fromMode: 'Mixed modes',
            toMode: getModeNameForLogging(2),
            camerasAffected: `${cameras.length} cameras: ${cameras.map(c => c.name).join('; ')}`,
            notes: `Triggered by motion sensor, will revert in ${MOTION_MODE_DURATION / 60000} minutes`
        });

        return true;
    } catch (error) {
        console.error('Error switching cameras to customized recording:', error);
        return false;
    }
}

async function revertCamerasToPreviousModes() {
    if (!ws || !isConnected) {
        console.error('Cannot revert cameras: not connected to Eufy service');
        return false;
    }

    try {
        console.log('⏰ 5 minutes elapsed. Reverting cameras to previous modes...');

        const camerasToRevert = Object.keys(previousCameraModes);
        if (camerasToRevert.length === 0) {
            console.log('No cameras to revert');
            return false;
        }

        const allDevices = await getAllDevices();
        const cameraNames = [];

        for (const serialNumber of camerasToRevert) {
            const previousMode = previousCameraModes[serialNumber];
            const currentMode = getDevicePowerMode(serialNumber);

            if (currentMode !== previousMode) {
                try {
                    await new Promise((resolve, reject) => {
                        const messageHandler = (data) => {
                            const message = JSON.parse(data.toString());
                            if (message.messageId === `revert_power_${serialNumber}_${requestId}`) {
                                ws.removeListener('message', messageHandler);
                                if (message.success) {
                                    resolve();
                                } else {
                                    reject(new Error(`Failed to revert power mode for ${serialNumber}`));
                                }
                            }
                        };

                        const requestId = Date.now();
                        ws.on('message', messageHandler);

                        const message = {
                            messageId: `revert_power_${serialNumber}_${requestId}`,
                            command: 'device.set_property',
                            serialNumber: serialNumber,
                            name: 'powerWorkingMode',
                            value: previousMode
                        };
                        ws.send(JSON.stringify(message));

                        setTimeout(() => {
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`Timeout reverting power mode for ${serialNumber}`));
                        }, 5000);
                    });

                    setDevicePowerMode(serialNumber, previousMode);

                    const device = allDevices.find(d => d.serialNumber === serialNumber);
                    const cameraName = device ? device.name : serialNumber;
                    cameraNames.push(cameraName);

                    console.log(`✅ ${cameraName}: Reverted to mode ${previousMode} (was mode ${currentMode})`);
                } catch (error) {
                    console.error(`❌ Error reverting ${serialNumber}:`, error.message);
                }
            }
        }

        if (cameraNames.length > 0) {
            logTransition({
                transitionType: 'Motion-Triggered Auto Revert',
                fromMode: getModeNameForLogging(2),
                toMode: 'Previous modes',
                camerasAffected: `${cameraNames.length} cameras: ${cameraNames.join('; ')}`,
                notes: `Reverted after ${MOTION_MODE_DURATION / 60000} minutes`
            });
        }

        previousCameraModes = {};
        motionTriggeredModeActive = false;

        return true;
    } catch (error) {
        console.error('Error reverting cameras to previous modes:', error);
        return false;
    }
}

async function handleMotionDetection(serialNumber, state) {
    console.log(`\n=== handleMotionDetection called ===`);
    console.log(`   Sensor: ${serialNumber}`);
    console.log(`   State: ${state}`);

    if (!state) {
        console.log(`   ❌ State is false, skipping`);
        return;
    }

    const settings = loadSettingsFromCSV();
    console.log(`   Settings loaded:`, settings);

    if (!settings?.motionTriggeredAutoSwitch) {
        console.log(`   ❌ Motion-triggered auto-switch is disabled`);
        return;
    }

    console.log(`   ✅ Motion-triggered auto-switch is enabled`);

    const selectedCameras = settings?.selectedCameras;

    if (!selectedCameras || selectedCameras.length === 0) {
        console.log('   ⚠️  No cameras selected for auto-switching');
        return;
    }

    let camerasToSwitch;
    try {
        camerasToSwitch = typeof selectedCameras === 'string' ? JSON.parse(selectedCameras) : selectedCameras;
        console.log(`   Selected cameras to switch:`, camerasToSwitch);
    } catch (e) {
        console.error('   ❌ Error parsing selectedCameras:', e);
        return;
    }

    if (motionTriggeredTimeout) {
        clearTimeout(motionTriggeredTimeout);
        console.log('   🔄 Motion detected again - resetting 5-minute timer');
    }

    if (!motionTriggeredModeActive) {
        console.log(`   📹 Initiating camera mode switch...`);
        const success = await switchCamerasToCustomizedRecording(camerasToSwitch);
        if (success) {
            motionTriggeredModeActive = true;
            console.log(`   ✅ Camera mode switch completed successfully`);
        } else {
            console.log(`   ❌ Camera mode switch failed`);
        }
    } else {
        console.log('   🔄 Already in motion-triggered mode - extending timer by 5 more minutes');
    }

    motionTriggeredTimeout = setTimeout(async () => {
        console.log(`\n⏰ 5-minute timer expired, reverting cameras...`);
        await revertCamerasToPreviousModes();
        motionTriggeredTimeout = null;
    }, MOTION_MODE_DURATION);

    console.log(`=== handleMotionDetection complete ===\n`);
}

async function checkMotionSensorTimestamps() {
    if (!ws || !isConnected) return;

    try {
        const allDevices = await getAllDevices();
        const motionSensors = allDevices.filter(device => device.category === 'motion_sensor');

        for (const sensor of motionSensors) {
            try {
                const properties = await new Promise((resolve, reject) => {
                    const messageHandler = (data) => {
                        const message = JSON.parse(data.toString());
                        if (message.messageId === `poll_motion_${sensor.serialNumber}_${requestId}`) {
                            ws.removeListener('message', messageHandler);
                            if (message.success && (message.properties || (message.result && message.result.properties))) {
                                const properties = message.properties || message.result.properties;
                                resolve(properties);
                            } else {
                                reject(new Error(`Failed to get properties for ${sensor.serialNumber}`));
                            }
                        }
                    };

                    const requestId = Date.now();
                    ws.on('message', messageHandler);

                    const message = {
                        messageId: `poll_motion_${sensor.serialNumber}_${requestId}`,
                        command: 'device.get_properties',
                        serialNumber: sensor.serialNumber
                    };
                    ws.send(JSON.stringify(message));

                    setTimeout(() => {
                        ws.removeListener('message', messageHandler);
                        reject(new Error(`Timeout getting properties for ${sensor.serialNumber}`));
                    }, 5000);
                });

                const currentTimestamp = properties.motionSensorPirEvent;
                const lastTimestamp = lastPirEventTimestamps[sensor.serialNumber];

                if (lastTimestamp && currentTimestamp && currentTimestamp !== lastTimestamp) {
                    const timestamp = new Date().toISOString();
                    const deviceName = properties.name || sensor.name;

                    console.log(`🚨 [${timestamp}] MOTION DETECTED (timestamp change) - Device: ${deviceName} (${sensor.serialNumber})`);
                    console.log(`   Previous: ${new Date(lastTimestamp).toISOString()}`);
                    console.log(`   Current:  ${new Date(currentTimestamp).toISOString()}`);

                    motionStates[sensor.serialNumber] = {
                        state: true,
                        timestamp: timestamp,
                        deviceName: deviceName
                    };

                    const sseData = JSON.stringify({
                        serialNumber: sensor.serialNumber,
                        deviceName: deviceName,
                        motionDetected: true,
                        timestamp: timestamp
                    });

                    sseClients.forEach(client => {
                        client.write(`data: ${sseData}\n\n`);
                    });

                    handleMotionDetection(sensor.serialNumber, true);
                }

                lastPirEventTimestamps[sensor.serialNumber] = currentTimestamp;

            } catch (error) {
                console.error(`Error checking motion sensor ${sensor.serialNumber}:`, error.message);
            }
        }
    } catch (error) {
        console.error('Error in checkMotionSensorTimestamps:', error);
    }
}

// Initialize device power modes
initializeDevicePowerModes();
loadDevicePowerModesFromCSV();

// Start the Eufy security server
const eufyServer = spawn('node', [
    'node_modules/eufy-security-ws/dist/bin/server.js',
    '-c', join(__dirname, 'config.json'),
    '-v',
    '-H', 'localhost',
    '-p', '3000'
]);

function refreshDevices() {
    if (!ws || !isConnected) return;

    const message = {
        messageId: 'poll_refresh_' + Date.now(),
        command: 'driver.poll_refresh'
    };
    ws.send(JSON.stringify(message));
}

// Function to get all devices - using known device serial numbers from your system
function getAllDevices() {
    if (!ws || !isConnected) return Promise.reject(new Error('Not connected'));

    // Based on your logs, these are your known devices
    const knownDevices = [
        {
            serialNumber: 'T8113N63212153EF',
            type: 'device',
            name: 'Backyard',
            deviceType: 8,
            category: 'camera'
        },
        {
            serialNumber: 'T8113N63212153E0',
            type: 'device',
            name: 'Shed',
            deviceType: 8,
            category: 'camera'
        },
        {
            serialNumber: 'T8170T102427108A',
            type: 'device',
            name: 'Driveway',
            deviceType: 48,
            category: 'camera'
        },
        {
            serialNumber: 'T8170T1024353ED4',
            type: 'device',
            name: 'Driveway Above View',
            deviceType: 48,
            category: 'camera'
        },
        {
            serialNumber: 'T8030P1324262B52',
            type: 'station',
            name: 'Base Station',
            deviceType: 'station',
            category: 'station'
        },
        {
            serialNumber: 'T8910P0025170762',
            type: 'device',
            name: 'Side door Sensor',
            deviceType: 'T8910',
            category: 'motion_sensor'
        }
    ];

    return Promise.resolve(knownDevices);
}

eufyServer.stdout.on('data', (data) => {
    console.log(`Eufy Server: ${data}`);

    // Check if server is listening and create WebSocket connection
    if (data.toString().includes('Eufy Security server listening') && !ws) {
        // Create a WebSocket client to connect to the Eufy server
        ws = new WebSocket('ws://localhost:3000');

        ws.on('open', () => {
            console.log('Connected to Eufy Security Server');
            // Connect to Eufy service
            const connectMessage = {
                messageId: 'connect_' + Date.now(),
                command: 'driver.connect'
            };
            ws.send(JSON.stringify(connectMessage));
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            console.log('Received message:', message);

            // Check if we're connected to Eufy service
            if (message.type === 'result' && message.messageId.startsWith('connect_')) {
                if (message.success) {
                    isConnected = true;
                    console.log('Successfully connected to Eufy service');
                    // After successful connection, refresh devices
                    refreshDevices();

                    // Start polling motion sensor timestamps every 2 seconds
                    if (motionSensorPollingInterval) {
                        clearInterval(motionSensorPollingInterval);
                    }
                    motionSensorPollingInterval = setInterval(() => {
                        checkMotionSensorTimestamps();
                    }, 2000);
                    console.log('Started motion sensor timestamp polling (2 second interval)');
                }
            }

        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        ws.on('close', () => {
            console.log('WebSocket connection closed');
            ws = null;
            isConnected = false;
            devices = [];

            if (motionSensorPollingInterval) {
                clearInterval(motionSensorPollingInterval);
                motionSensorPollingInterval = null;
                console.log('Stopped motion sensor timestamp polling');
            }
        });
    }
});

eufyServer.stderr.on('data', (data) => {
    console.error(`Eufy Server Error: ${data}`);
});

// CORS middleware - allow requests from browser
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Express JSON middleware
app.use(express.json());

// Express routes
app.get('/', (req, res) => {
    res.send('Eufy Security Example App');
});

// API endpoint to get all devices
app.get('/api/devices', async (req, res) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).send({ error: 'WebSocket not connected' });
    }

    if (!isConnected) {
        return res.status(503).send({ error: 'Not connected to Eufy service yet. Please wait and try again.' });
    }

    try {
        const devices = await getAllDevices();

        // Get properties for each device to provide current status
        const devicesWithStatus = [];

        for (const device of devices) {
            if (device.type === 'device') {
                try {
                    const properties = await new Promise((resolve, reject) => {
                        const messageHandler = (data) => {
                            const message = JSON.parse(data.toString());
                            if (message.messageId === `get_device_props_${device.serialNumber}_${requestId}`) {
                                ws.removeListener('message', messageHandler);
                                if (message.success && (message.properties || (message.result && message.result.properties))) {
                                    // Handle both response formats
                                    const properties = message.properties || message.result.properties;
                                    resolve(properties);
                                } else {
                                    reject(new Error(`Failed to get properties for ${device.serialNumber}`));
                                }
                            }
                        };

                        const requestId = Date.now();
                        ws.on('message', messageHandler);

                        const message = {
                            messageId: `get_device_props_${device.serialNumber}_${requestId}`,
                            command: 'device.get_properties',
                            serialNumber: device.serialNumber
                        };
                        ws.send(JSON.stringify(message));

                        setTimeout(() => {
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`Timeout getting properties for ${device.serialNumber}`));
                        }, 5000);
                    });

                    const storedPowerMode = getDevicePowerMode(device.serialNumber);

                    devicesWithStatus.push({
                        ...device,
                        properties: {
                            motionDetection: properties.motionDetection,
                            motionDetectionTypeAllOtherMotions: properties.motionDetectionTypeAllOtherMotions,
                            powerWorkingMode: storedPowerMode, // Use stored value
                            battery: properties.battery,
                            enabled: properties.enabled
                        }
                    });
                } catch (error) {
                    devicesWithStatus.push({
                        ...device,
                        error: error.message
                    });
                }
            } else {
                devicesWithStatus.push(device);
            }
        }

        res.send({ devices: devicesWithStatus });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// API endpoint to toggle between recording modes and motion detection
app.post('/api/cameras/toggle-mode', async (req, res) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).send({ error: 'WebSocket not connected' });
    }

    if (!isConnected) {
        return res.status(503).send({ error: 'Not connected to Eufy service yet. Please wait and try again.' });
    }

    try {
        // Get selected cameras from request body if provided
        const { selectedCameras } = req.body || {};

        // First get all devices
        console.log('Getting all devices for mode toggle...');
        const allDevices = await getAllDevices();

        // Filter for camera devices (exclude stations)
        let cameras = allDevices.filter(device => device.type === 'device');
        console.log(`Found ${cameras.length} total camera devices:`, cameras.map(c => `${c.name} (${c.serialNumber})`));

        // Apply camera selection filter if provided
        if (selectedCameras && Array.isArray(selectedCameras) && selectedCameras.length > 0) {
            const originalCameraCount = cameras.length;
            cameras = cameras.filter(camera => selectedCameras.includes(camera.serialNumber));
            console.log(`Filtered to ${cameras.length} selected cameras (from ${originalCameraCount} total):`,
                cameras.map(c => `${c.name} (${c.serialNumber})`));

            if (cameras.length === 0) {
                return res.status(400).send({
                    error: 'None of the selected cameras were found in the system',
                    selectedCameras: selectedCameras,
                    availableCameras: allDevices.filter(device => device.type === 'device').map(c => ({
                        serialNumber: c.serialNumber,
                        name: c.name
                    }))
                });
            }
        } else {
            console.log('No camera selection specified, processing all cameras');
        }

        if (cameras.length === 0) {
            return res.status(404).send({ error: 'No camera devices found' });
        }

        // Check current state of all cameras to determine what action to take
        console.log('Checking current state of all cameras...');
        let customizedRecordingCount = 0;
        let allOtherMotionsEnabledCount = 0;
        let batteryModeCount = 0;
        let allOtherMotionsDisabledCount = 0;

        const cameraStates = [];

        for (const camera of cameras) {
            try {
                const properties = await new Promise((resolve, reject) => {
                    const messageHandler = (data) => {
                        const message = JSON.parse(data.toString());
                        if (message.messageId === `check_state_${camera.serialNumber}_${requestId}`) {
                            ws.removeListener('message', messageHandler);
                            if (message.success && (message.properties || (message.result && message.result.properties))) {
                                const properties = message.properties || message.result.properties;
                                resolve(properties);
                            } else {
                                reject(new Error(`Failed to get properties for ${camera.serialNumber}`));
                            }
                        }
                    };

                    const requestId = Date.now();
                    ws.on('message', messageHandler);

                    const message = {
                        messageId: `check_state_${camera.serialNumber}_${requestId}`,
                        command: 'device.get_properties',
                        serialNumber: camera.serialNumber
                    };
                    ws.send(JSON.stringify(message));

                    setTimeout(() => {
                        ws.removeListener('message', messageHandler);
                        reject(new Error(`Timeout checking state for ${camera.serialNumber}`));
                    }, 5000);
                });

                cameraStates.push({
                    camera,
                    powerWorkingMode: getDevicePowerMode(camera.serialNumber), // Use stored value
                    motionDetectionTypeAllOtherMotions: properties.motionDetectionTypeAllOtherMotions,
                    motionDetection: properties.motionDetection
                });

                // Count states using stored power mode (0=Surveillance/Battery, 2=Customized Recording)
                const storedPowerMode = getDevicePowerMode(camera.serialNumber);
                if (storedPowerMode === 2) customizedRecordingCount++;
                if (storedPowerMode === 0) batteryModeCount++; // Mode 0 is Optimal Surveillance (battery saving)
                if (properties.motionDetectionTypeAllOtherMotions === true) allOtherMotionsEnabledCount++;
                if (properties.motionDetectionTypeAllOtherMotions === false) allOtherMotionsDisabledCount++;

                console.log(`${camera.name}: Power Mode ${storedPowerMode} (stored: ${storedPowerMode === 0 ? 'Surveillance/Battery' : storedPowerMode === 2 ? 'Customized Recording' : 'Other'}), All Other Motions: ${properties.motionDetectionTypeAllOtherMotions}`);
            } catch (error) {
                console.error(`Error checking state for ${camera.name}:`, error.message);
                cameraStates.push({
                    camera,
                    error: error.message
                });
            }
        }

        // Determine the target state based on current majority state
        let targetMode, targetAllOtherMotions, actionDescription;

        // If majority are in customized recording (2) with all other motions enabled
        if (customizedRecordingCount >= cameraStates.length / 2 && allOtherMotionsEnabledCount >= cameraStates.length / 2) {
            targetMode = 0; // Switch to Optimal Surveillance (battery saving)
            targetAllOtherMotions = false; // Disable all other motions
            actionDescription = 'Switching to Optimal Surveillance mode (battery saving) and disabling all other motions';
        }
        // If majority are in Surveillance/battery mode (0) with all other motions disabled
        else if (batteryModeCount >= cameraStates.length / 2 && allOtherMotionsDisabledCount >= cameraStates.length / 2) {
            targetMode = 2; // Switch to customized recording
            targetAllOtherMotions = true; // Enable all other motions
            actionDescription = 'Switching to Customized Recording mode and enabling all other motions';
        }
        // Default behavior - switch to customized recording with all motions enabled
        else {
            targetMode = 2;
            targetAllOtherMotions = true;
            actionDescription = 'Mixed states detected - defaulting to Customized Recording mode with all other motions enabled';
        }

        console.log(`Action: ${actionDescription}`);
        console.log(`Target: Power Mode ${targetMode}, All Other Motions: ${targetAllOtherMotions}`);

        // Process each camera
        const results = [];

        for (const cameraState of cameraStates) {
            if (cameraState.error) {
                results.push({
                    serialNumber: cameraState.camera.serialNumber,
                    name: cameraState.camera.name,
                    success: false,
                    error: cameraState.error
                });
                continue;
            }

            const camera = cameraState.camera;
            console.log(`Processing camera: ${camera.name} (${camera.serialNumber})`);

            try {
                let changesMade = false;
                const changes = [];

                // Update power working mode if needed
                if (cameraState.powerWorkingMode !== targetMode) {
                    console.log(`Changing power mode from ${cameraState.powerWorkingMode} to ${targetMode} for ${camera.name}`);
                    await new Promise((resolve, reject) => {
                        const messageHandler = (data) => {
                            const message = JSON.parse(data.toString());
                            if (message.messageId === `set_power_mode_${camera.serialNumber}_${requestId}`) {
                                ws.removeListener('message', messageHandler);
                                if (message.success) {
                                    resolve();
                                } else {
                                    reject(new Error(`Failed to set power mode for ${camera.serialNumber}`));
                                }
                            }
                        };

                        const requestId = Date.now();
                        ws.on('message', messageHandler);

                        const message = {
                            messageId: `set_power_mode_${camera.serialNumber}_${requestId}`,
                            command: 'device.set_property',
                            serialNumber: camera.serialNumber,
                            name: 'powerWorkingMode',
                            value: targetMode
                        };
                        ws.send(JSON.stringify(message));

                        setTimeout(() => {
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`Timeout setting power mode for ${camera.serialNumber}`));
                        }, 5000);
                    });
                    changesMade = true;
                    changes.push(`Power mode: ${cameraState.powerWorkingMode} → ${targetMode}`);
                    // Store the new power mode in our local storage
                    setDevicePowerMode(camera.serialNumber, targetMode);
                }

                // Enable motion detection if not already enabled (required for all other motions setting)
                if (cameraState.motionDetection !== true) {
                    console.log(`Enabling motion detection for ${camera.name}`);
                    await new Promise((resolve, reject) => {
                        const messageHandler = (data) => {
                            const message = JSON.parse(data.toString());
                            if (message.messageId === `set_motion_${camera.serialNumber}_${requestId}`) {
                                ws.removeListener('message', messageHandler);
                                if (message.success) {
                                    resolve();
                                } else {
                                    reject(new Error(`Failed to enable motion detection for ${camera.serialNumber}`));
                                }
                            }
                        };

                        const requestId = Date.now();
                        ws.on('message', messageHandler);

                        const message = {
                            messageId: `set_motion_${camera.serialNumber}_${requestId}`,
                            command: 'device.set_property',
                            serialNumber: camera.serialNumber,
                            name: 'motionDetection',
                            value: true
                        };
                        ws.send(JSON.stringify(message));

                        setTimeout(() => {
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`Timeout setting motion detection for ${camera.serialNumber}`));
                        }, 5000);
                    });
                    changesMade = true;
                    changes.push(`Motion detection: ${cameraState.motionDetection} → true`);
                }

                // Update all other motions setting if needed
                if (cameraState.motionDetectionTypeAllOtherMotions !== targetAllOtherMotions) {
                    console.log(`Changing all other motions from ${cameraState.motionDetectionTypeAllOtherMotions} to ${targetAllOtherMotions} for ${camera.name}`);
                    await new Promise((resolve, reject) => {
                        const messageHandler = (data) => {
                            const message = JSON.parse(data.toString());
                            if (message.messageId === `set_all_motions_${camera.serialNumber}_${requestId}`) {
                                ws.removeListener('message', messageHandler);
                                if (message.success) {
                                    resolve();
                                } else {
                                    reject(new Error(`Failed to set all other motions for ${camera.serialNumber}`));
                                }
                            }
                        };

                        const requestId = Date.now();
                        ws.on('message', messageHandler);

                        const message = {
                            messageId: `set_all_motions_${camera.serialNumber}_${requestId}`,
                            command: 'device.set_property',
                            serialNumber: camera.serialNumber,
                            name: 'motionDetectionTypeAllOtherMotions',
                            value: targetAllOtherMotions
                        };
                        ws.send(JSON.stringify(message));

                        setTimeout(() => {
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`Timeout setting all other motions for ${camera.serialNumber}`));
                        }, 5000);
                    });
                    changesMade = true;
                    changes.push(`All other motions: ${cameraState.motionDetectionTypeAllOtherMotions} → ${targetAllOtherMotions}`);
                }

                // Verify the changes
                const updatedProperties = await new Promise((resolve, reject) => {
                    const messageHandler = (data) => {
                        const message = JSON.parse(data.toString());
                        if (message.messageId === `verify_props_${camera.serialNumber}_${requestId}`) {
                            ws.removeListener('message', messageHandler);
                            if (message.success && (message.properties || (message.result && message.result.properties))) {
                                const properties = message.properties || message.result.properties;
                                resolve(properties);
                            } else {
                                reject(new Error(`Failed to verify properties for ${camera.serialNumber}`));
                            }
                        }
                    };

                    const requestId = Date.now();
                    ws.on('message', messageHandler);

                    const message = {
                        messageId: `verify_props_${camera.serialNumber}_${requestId}`,
                        command: 'device.get_properties',
                        serialNumber: camera.serialNumber
                    };
                    ws.send(JSON.stringify(message));

                    setTimeout(() => {
                        ws.removeListener('message', messageHandler);
                        reject(new Error(`Timeout verifying properties for ${camera.serialNumber}`));
                    }, 5000);
                });

                // Since powerWorkingMode is no longer available from API, check our stored value and motion detection
                const storedPowerMode = getDevicePowerMode(camera.serialNumber);
                const success = storedPowerMode === targetMode &&
                    updatedProperties.motionDetectionTypeAllOtherMotions === targetAllOtherMotions;

                // Map power working mode values to readable names
                const getPowerModeName = (mode) => {
                    switch (mode) {
                        case 0: return 'Optimal Surveillance';
                        case 1: return 'Optimal Battery Life';
                        case 2: return 'Customized Recording';
                        default: return `Unknown (${mode})`;
                    }
                };

                results.push({
                    serialNumber: camera.serialNumber,
                    name: camera.name,
                    success: success,
                    changesMade: changesMade,
                    changes: changes,
                    before: {
                        powerWorkingMode: {
                            value: cameraState.powerWorkingMode,
                            name: getPowerModeName(cameraState.powerWorkingMode)
                        },
                        motionDetectionTypeAllOtherMotions: cameraState.motionDetectionTypeAllOtherMotions,
                        motionDetection: cameraState.motionDetection
                    },
                    after: {
                        powerWorkingMode: {
                            value: storedPowerMode,
                            name: getPowerModeName(storedPowerMode)
                        },
                        motionDetectionTypeAllOtherMotions: updatedProperties.motionDetectionTypeAllOtherMotions,
                        motionDetection: updatedProperties.motionDetection
                    }
                });

                console.log(`Completed processing ${camera.name}: ${success ? 'SUCCESS' : 'FAILED'}`);

            } catch (error) {
                console.error(`Error processing camera ${camera.name}:`, error.message);
                results.push({
                    serialNumber: camera.serialNumber,
                    name: camera.name,
                    success: false,
                    error: error.message
                });
            }
        }

        const successfulCameras = results.filter(r => r.success).length;
        const camerasWithChanges = results.filter(r => r.changesMade).length;

        // Log the transition to CSV if any cameras were changed
        if (camerasWithChanges > 0) {
            // Determine the majority "from" mode by looking at ALL cameras that attempted changes (regardless of success)
            const camerasWithChangesAttempted = results.filter(r => r.changesMade);
            const fromModes = camerasWithChangesAttempted.map(r => r.before.powerWorkingMode.value);
            const majorityFromMode = fromModes.length > 0 ? fromModes[0] : 0; // Default to 0 (Surveillance) if no data

            // Create camera names list from all cameras that had changes attempted
            const cameraNames = camerasWithChangesAttempted.map(r => r.name).join('; ');

            // Log to CSV
            const logResult = logTransition({
                transitionType: actionDescription,
                fromMode: getModeNameForLogging(majorityFromMode),
                toMode: getModeNameForLogging(targetMode),
                camerasAffected: `${camerasWithChanges} cameras: ${cameraNames}`,
                notes: `${successfulCameras}/${cameraStates.length} cameras successful`
            });

            console.log(`Transition logged: ${camerasWithChanges} cameras switched from ${getModeNameForLogging(majorityFromMode)} to ${getModeNameForLogging(targetMode)}`);
        }

        res.send({
            action: actionDescription,
            targetSettings: {
                powerWorkingMode: {
                    value: targetMode,
                    name: targetMode === 0 ? 'Optimal Surveillance (Battery Saving)' : 'Customized Recording'
                },
                allOtherMotions: targetAllOtherMotions
            },
            summary: {
                totalCameras: cameraStates.length,
                successfulCameras: successfulCameras,
                camerasWithChanges: camerasWithChanges,
                camerasAlreadyCorrect: successfulCameras - camerasWithChanges
            },
            results: results
        });

    } catch (error) {
        console.error('Error in toggle-mode:', error);
        res.status(500).send({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connection: isConnected ? 'connected' : 'disconnected'
    });
});

// API endpoint to get transition logs
app.get('/api/transitions', (req, res) => {
    try {
        if (!fs.existsSync(csvFilePath)) {
            return res.send({
                transitions: [],
                message: 'No transition logs found'
            });
        }

        const csvContent = fs.readFileSync(csvFilePath, 'utf8');
        const lines = csvContent.trim().split('\n');

        if (lines.length <= 1) { // Only header or empty
            return res.send({
                transitions: [],
                message: 'No transition data available'
            });
        }

        // Parse CSV data (skip header) with proper CSV parsing
        const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];

                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++; // Skip next quote
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current);
            return result;
        };

        const transitions = lines.slice(1)
            .filter(line => line.trim().length > 0) // Skip empty lines
            .map(line => {
                const columns = parseCSVLine(line);
                return {
                    timestamp: columns[0] || '',
                    date: columns[1] || '',
                    time: columns[2] || '',
                    transitionType: columns[3] || '',
                    fromMode: columns[4] || '',
                    toMode: columns[5] || '',
                    camerasAffected: columns[6] || '',
                    hoursSinceLastTransition: columns[7] || '',
                    notes: columns[8] || ''
                };
            }).reverse(); // Most recent first

        // Get summary stats
        const totalTransitions = transitions.length;
        const lastTransition = transitions[0];
        const mostRecentHours = lastTransition ? calculateHoursSinceLastTransition() : 'N/A';

        res.send({
            transitions: transitions,
            summary: {
                totalTransitions,
                lastTransition: lastTransition?.timestamp || 'Never',
                hoursSinceLastTransition: mostRecentHours
            }
        });

    } catch (error) {
        console.error('Error reading transition logs:', error);
        res.status(500).send({ error: 'Failed to read transition logs' });
    }
});

app.get('/api/motion-sensors', async (req, res) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).send({ error: 'WebSocket not connected' });
    }

    if (!isConnected) {
        return res.status(503).send({ error: 'Not connected to Eufy service yet. Please wait and try again.' });
    }

    try {
        const devices = await getAllDevices();

        const motionSensors = [];

        for (const device of devices) {
            if (device.category === 'motion_sensor') {
                try {
                    const properties = await new Promise((resolve, reject) => {
                        const messageHandler = (data) => {
                            const message = JSON.parse(data.toString());
                            if (message.messageId === `get_device_props_${device.serialNumber}_${requestId}`) {
                                ws.removeListener('message', messageHandler);
                                if (message.success && (message.properties || (message.result && message.result.properties))) {
                                    const properties = message.properties || message.result.properties;
                                    resolve(properties);
                                } else {
                                    reject(new Error(`Failed to get properties for ${device.serialNumber}`));
                                }
                            }
                        };

                        const requestId = Date.now();
                        ws.on('message', messageHandler);

                        const message = {
                            messageId: `get_device_props_${device.serialNumber}_${requestId}`,
                            command: 'device.get_properties',
                            serialNumber: device.serialNumber
                        };
                        ws.send(JSON.stringify(message));

                        setTimeout(() => {
                            ws.removeListener('message', messageHandler);
                            reject(new Error(`Timeout getting properties for ${device.serialNumber}`));
                        }, 5000);
                    });

                    const currentMotionState = motionStates[device.serialNumber];

                    motionSensors.push({
                        ...device,
                        properties: {
                            name: properties.name,
                            motionDetected: currentMotionState ? currentMotionState.state : properties.motionDetected,
                            batteryLow: properties.batteryLow,
                            motionSensorPirEvent: properties.motionSensorPirEvent,
                            model: properties.model,
                            softwareVersion: properties.softwareVersion
                        },
                        realtimeMotion: currentMotionState ? currentMotionState.state : false
                    });
                } catch (error) {
                    motionSensors.push({
                        ...device,
                        error: error.message
                    });
                }
            }
        }

        res.send({ motionSensors });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

app.get('/api/settings', (req, res) => {
    try {
        const settings = loadSettingsFromCSV();

        if (!settings) {
            return res.send({
                settings: {},
                message: 'No settings found, using defaults'
            });
        }

        const uiSettings = {};
        Object.keys(settings).forEach(key => {
            if (!key.startsWith('devicePowerMode_')) {
                uiSettings[key] = settings[key];
            }
        });

        res.send({
            settings: uiSettings,
            message: 'Settings loaded successfully'
        });
    } catch (error) {
        console.error('Error reading settings:', error);
        res.status(500).send({ error: 'Failed to read settings' });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const newSettings = req.body;

        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).send({ error: 'Invalid settings data' });
        }

        const existingSettings = loadSettingsFromCSV() || {};

        const devicePowerModeKeys = {};
        Object.keys(existingSettings).forEach(key => {
            if (key.startsWith('devicePowerMode_')) {
                devicePowerModeKeys[key] = existingSettings[key];
            }
        });

        const mergedSettings = {
            ...newSettings,
            ...devicePowerModeKeys
        };

        const success = saveSettingsToCSV(mergedSettings);

        if (success) {
            res.send({
                success: true,
                message: 'Settings saved successfully'
            });
        } else {
            res.status(500).send({ error: 'Failed to save settings' });
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).send({ error: 'Failed to save settings' });
    }
});

app.get('/api/motion-events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write('data: {"status":"connected"}\n\n');

    sseClients.push(res);

    req.on('close', () => {
        sseClients = sseClients.filter(client => client !== res);
    });
});

app.get('/api/motion-triggered-status', (req, res) => {
    try {
        const settings = loadSettingsFromCSV();
        const timeRemaining = motionTriggeredTimeout ? MOTION_MODE_DURATION : 0;

        res.send({
            active: motionTriggeredModeActive,
            enabled: settings?.motionTriggeredAutoSwitch || false,
            timeRemainingMs: timeRemaining,
            timeRemainingMinutes: Math.round(timeRemaining / 60000),
            affectedCameras: Object.keys(previousCameraModes),
            previousModes: previousCameraModes
        });
    } catch (error) {
        console.error('Error getting motion-triggered status:', error);
        res.status(500).send({ error: 'Failed to get status' });
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});