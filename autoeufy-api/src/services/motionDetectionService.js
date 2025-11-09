import { ws, isConnected, motionStates, lastPirEventTimestamps, sseClients, motionTriggeredTimeout, setMotionTriggeredTimeout, motionTriggeredModeActive, setMotionTriggeredModeActive, MOTION_MODE_DURATION } from '../config/state.js';
import { loadSettingsFromCSV } from '../utils/csvLogger.js';
import { switchCamerasToCustomizedRecording, revertCamerasToPreviousModes } from './cameraService.js';
import { getAllDevices } from './deviceService.js';

export async function handleMotionDetection(serialNumber, state) {
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
            setMotionTriggeredModeActive(true);
            console.log(`   ✅ Camera mode switch completed successfully`);
        } else {
            console.log(`   ❌ Camera mode switch failed`);
        }
    } else {
        console.log('   🔄 Already in motion-triggered mode - extending timer by 5 more minutes');
    }

    const timeout = setTimeout(async () => {
        console.log(`\n⏰ 5-minute timer expired, reverting cameras...`);
        await revertCamerasToPreviousModes();
        setMotionTriggeredTimeout(null);
    }, MOTION_MODE_DURATION);
    
    setMotionTriggeredTimeout(timeout);

    console.log(`=== handleMotionDetection complete ===\n`);
}

export async function checkMotionSensorTimestamps() {
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
