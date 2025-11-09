import express from 'express';
import WebSocket from 'ws';
import { ws, isConnected } from '../config/state.js';
import { getAllDevices } from '../services/deviceService.js';
import { getDevicePowerMode, setDevicePowerMode, getModeNameForLogging } from '../utils/devicePowerModes.js';
import { logTransition } from '../utils/csvLogger.js';

const router = express.Router();

router.post('/cameras/toggle-mode', async (req, res) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).send({ error: 'WebSocket not connected' });
    }

    if (!isConnected) {
        return res.status(503).send({ error: 'Not connected to Eufy service yet. Please wait and try again.' });
    }

    try {
        const { selectedCameras } = req.body || {};

        console.log('Getting all devices for mode toggle...');
        const allDevices = await getAllDevices();

        let cameras = allDevices.filter(device => device.type === 'device');
        console.log(`Found ${cameras.length} total camera devices:`, cameras.map(c => `${c.name} (${c.serialNumber})`));

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
                    powerWorkingMode: getDevicePowerMode(camera.serialNumber),
                    motionDetectionTypeAllOtherMotions: properties.motionDetectionTypeAllOtherMotions,
                    motionDetection: properties.motionDetection
                });

                const storedPowerMode = getDevicePowerMode(camera.serialNumber);
                if (storedPowerMode === 2) customizedRecordingCount++;
                if (storedPowerMode === 0) batteryModeCount++;
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

        let targetMode, targetAllOtherMotions, actionDescription;

        if (customizedRecordingCount >= cameraStates.length / 2 && allOtherMotionsEnabledCount >= cameraStates.length / 2) {
            targetMode = 0;
            targetAllOtherMotions = false;
            actionDescription = 'Switching to Optimal Surveillance mode (battery saving) and disabling all other motions';
        }
        else if (batteryModeCount >= cameraStates.length / 2 && allOtherMotionsDisabledCount >= cameraStates.length / 2) {
            targetMode = 2;
            targetAllOtherMotions = true;
            actionDescription = 'Switching to Customized Recording mode and enabling all other motions';
        }
        else {
            targetMode = 2;
            targetAllOtherMotions = true;
            actionDescription = 'Mixed states detected - defaulting to Customized Recording mode with all other motions enabled';
        }

        console.log(`Action: ${actionDescription}`);
        console.log(`Target: Power Mode ${targetMode}, All Other Motions: ${targetAllOtherMotions}`);

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
                    setDevicePowerMode(camera.serialNumber, targetMode);
                }

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

                const storedPowerMode = getDevicePowerMode(camera.serialNumber);
                const success = storedPowerMode === targetMode &&
                    updatedProperties.motionDetectionTypeAllOtherMotions === targetAllOtherMotions;

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

        if (camerasWithChanges > 0) {
            const camerasWithChangesAttempted = results.filter(r => r.changesMade);
            const fromModes = camerasWithChangesAttempted.map(r => r.before.powerWorkingMode.value);
            const majorityFromMode = fromModes.length > 0 ? fromModes[0] : 0;

            const cameraNames = camerasWithChangesAttempted.map(r => r.name).join('; ');

            logTransition({
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

export default router;
