import { ws, isConnected, previousCameraModes, setPreviousCameraModes, setMotionTriggeredModeActive, MOTION_MODE_DURATION } from '../config/state.js';
import { getDevicePowerMode, setDevicePowerMode, getModeNameForLogging } from '../utils/devicePowerModes.js';
import { logTransition } from '../utils/csvLogger.js';
import { getAllDevices } from './deviceService.js';

export async function switchCamerasToCustomizedRecording(selectedCameras) {
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

export async function revertCamerasToPreviousModes() {
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

        setPreviousCameraModes({});
        setMotionTriggeredModeActive(false);

        return true;
    } catch (error) {
        console.error('Error reverting cameras to previous modes:', error);
        return false;
    }
}
