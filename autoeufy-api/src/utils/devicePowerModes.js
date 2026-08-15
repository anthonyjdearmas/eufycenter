import { devicePowerModes, setDevicePowerModes } from '../config/state.js';
import { saveDevicePowerModesToCSV, loadDevicePowerModesFromCSV as loadFromCSV } from './csvLogger.js';

export { loadFromCSV as loadDevicePowerModesFromCSV };

export function initializeDevicePowerModes() {
    const initialModes = {
        'T8113N63212153EF': 0,
        'T8113N63212153E0': 0,
        'T8170T102427108A': 0,
        'T8170T1024353ED4': 0,
    };
    setDevicePowerModes(initialModes);
    console.log('Initialized device power modes (0=Surveillance/Battery, 2=Customized Recording):', devicePowerModes);
}

export function getDevicePowerMode(serialNumber) {
    return devicePowerModes[serialNumber] || 0;
}

export function setDevicePowerMode(serialNumber, mode) {
    devicePowerModes[serialNumber] = mode;
    console.log(`Updated power mode for ${serialNumber} to ${mode}`);
    saveDevicePowerModesToCSV();
}

export function getModeNameForLogging(mode) {
    switch (Number(mode)) {
        case 0: return 'Optimal Surveillance (Battery Saving)';
        case 2: return 'Customized Recording';
        default: return `Unknown(${mode})`;
    }
}
