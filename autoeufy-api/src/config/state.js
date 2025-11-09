export let ws = null;
export let isConnected = false;
export let devices = [];
export let devicePowerModes = {};

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
