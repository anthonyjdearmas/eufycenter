import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 8080;

let ws = null;
let isConnected = false;
let devices = [];

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
            deviceType: 8
        },
        {
            serialNumber: 'T8113N63212153E0',
            type: 'device', 
            name: 'Shed',
            deviceType: 8
        },
        {
            serialNumber: 'T8170T102427108A',
            type: 'device',
            name: 'Driveway',
            deviceType: 48
        },
        {
            serialNumber: 'T8170T1024353ED4',
            type: 'device',
            name: 'Driveway Above View',
            deviceType: 48
        },
        {
            serialNumber: 'T8030P1324262B52',
            type: 'station',
            name: 'Base Station',
            deviceType: 'station'
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
        });
    }
});

eufyServer.stderr.on('data', (data) => {
    console.error(`Eufy Server Error: ${data}`);
});

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
                    
                    devicesWithStatus.push({
                        ...device,
                        properties: {
                            motionDetection: properties.motionDetection,
                            motionDetectionTypeAllOtherMotions: properties.motionDetectionTypeAllOtherMotions,
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
        // First get all devices
        console.log('Getting all devices for mode toggle...');
        const allDevices = await getAllDevices();
        
        // Filter for camera devices (exclude stations)
        const cameras = allDevices.filter(device => device.type === 'device');
        console.log(`Found ${cameras.length} camera devices:`, cameras.map(c => `${c.name} (${c.serialNumber})`));
        
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
                    powerWorkingMode: properties.powerWorkingMode,
                    motionDetectionTypeAllOtherMotions: properties.motionDetectionTypeAllOtherMotions,
                    motionDetection: properties.motionDetection
                });

                // Count states
                if (properties.powerWorkingMode === 2) customizedRecordingCount++;
                if (properties.powerWorkingMode === 1) batteryModeCount++;
                if (properties.motionDetectionTypeAllOtherMotions === true) allOtherMotionsEnabledCount++;
                if (properties.motionDetectionTypeAllOtherMotions === false) allOtherMotionsDisabledCount++;

                console.log(`${camera.name}: Power Mode ${properties.powerWorkingMode}, All Other Motions: ${properties.motionDetectionTypeAllOtherMotions}`);
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
        if (customizedRecordingCount >= cameras.length / 2 && allOtherMotionsEnabledCount >= cameras.length / 2) {
            targetMode = 1; // Switch to optimal battery life
            targetAllOtherMotions = false; // Disable all other motions
            actionDescription = 'Switching to Optimal Battery Life mode and disabling all other motions';
        }
        // If majority are in battery mode (1) with all other motions disabled
        else if (batteryModeCount >= cameras.length / 2 && allOtherMotionsDisabledCount >= cameras.length / 2) {
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

                const success = updatedProperties.powerWorkingMode === targetMode && 
                               updatedProperties.motionDetectionTypeAllOtherMotions === targetAllOtherMotions;

                // Map power working mode values to readable names
                const getPowerModeName = (mode) => {
                    switch(mode) {
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
                            value: updatedProperties.powerWorkingMode,
                            name: getPowerModeName(updatedProperties.powerWorkingMode)
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

        res.send({ 
            action: actionDescription,
            targetSettings: {
                powerWorkingMode: {
                    value: targetMode,
                    name: targetMode === 1 ? 'Optimal Battery Life' : 'Customized Recording'
                },
                allOtherMotions: targetAllOtherMotions
            },
            summary: {
                totalCameras: cameras.length,
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

// Start the Express server
app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});