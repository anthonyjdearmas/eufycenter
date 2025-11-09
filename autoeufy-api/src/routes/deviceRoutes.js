import express from 'express';
import WebSocket from 'ws';
import { ws, isConnected, motionStates } from '../config/state.js';
import { getAllDevices } from '../services/deviceService.js';
import { getDevicePowerMode } from '../utils/devicePowerModes.js';

const router = express.Router();

router.get('/devices', async (req, res) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).send({ error: 'WebSocket not connected' });
    }

    if (!isConnected) {
        return res.status(503).send({ error: 'Not connected to Eufy service yet. Please wait and try again.' });
    }

    try {
        const devices = await getAllDevices();

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
                            powerWorkingMode: storedPowerMode,
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

router.get('/motion-sensors', async (req, res) => {
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

export default router;
