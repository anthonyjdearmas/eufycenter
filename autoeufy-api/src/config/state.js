export let ws = null;
export let isConnected = false;
export let devices = [];
export let devicePowerModes = {};
export let sseClients = [];
export let motionStates = {};
export let lastPirEventTimestamps = {};
export let motionSensorPollingInterval = null;
export let motionTriggeredModeActive = false;
export let motionTriggeredTimeout = null;
export let previousCameraModes = {};

export const MOTION_MODE_DURATION = 5 * 60 * 1000;

export function setWs(newWs) {
    ws = newWs;
}

export function setIsConnected(value) {
    isConnected = value;
}

export function setDevices(newDevices) {
    devices = newDevices;
}

export function setDevicePowerModes(modes) {
    devicePowerModes = modes;
}

export function setSseClients(clients) {
    sseClients = clients;
}

export function setMotionStates(states) {
    motionStates = states;
}

export function setLastPirEventTimestamps(timestamps) {
    lastPirEventTimestamps = timestamps;
}

export function setMotionSensorPollingInterval(interval) {
    motionSensorPollingInterval = interval;
}

export function setMotionTriggeredModeActive(value) {
    motionTriggeredModeActive = value;
}

export function setMotionTriggeredTimeout(timeout) {
    motionTriggeredTimeout = timeout;
}

export function setPreviousCameraModes(modes) {
    previousCameraModes = modes;
}
