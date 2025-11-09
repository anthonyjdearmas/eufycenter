import fs from 'fs';
import { CSV_FILE_PATH, SETTINGS_FILE_PATH, DATABASE_DIR } from '../config/constants.js';
import { devicePowerModes } from '../config/state.js';

function getLastTransitionTimestamp() {
    try {
        if (!fs.existsSync(CSV_FILE_PATH)) {
            return null;
        }

        const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
        const lines = csvContent.trim().split('\n');

        if (lines.length <= 1) {
            return null;
        }

        const lastLine = lines[lines.length - 1];
        const columns = lastLine.split(',');
        return columns[0] ? new Date(columns[0]) : null;
    } catch (error) {
        console.error('Error reading last transition timestamp:', error);
        return null;
    }
}

function calculateHoursSinceLastTransition() {
    const lastTimestamp = getLastTransitionTimestamp();
    if (!lastTimestamp) {
        return 'N/A';
    }

    const now = new Date();
    const diffMs = now - lastTimestamp;
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.round(diffHours * 100) / 100;
}

export function logTransition(transitionData) {
    try {
        if (!fs.existsSync(CSV_FILE_PATH)) {
            const header = 'timestamp,date,time,transition_type,from_mode,to_mode,cameras_affected,hours_since_last_transition,notes\n';
            fs.writeFileSync(CSV_FILE_PATH, header);
        }

        const now = new Date();
        const timestamp = now.toISOString();
        const date = now.toLocaleDateString();
        const time = now.toLocaleTimeString();
        const hoursSinceLastTransition = calculateHoursSinceLastTransition();

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

        fs.appendFileSync(CSV_FILE_PATH, csvRow + '\n');

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

export function loadSettingsFromCSV() {
    try {
        if (!fs.existsSync(SETTINGS_FILE_PATH)) {
            console.log('Settings CSV not found, will create on first save');
            return null;
        }

        const csvContent = fs.readFileSync(SETTINGS_FILE_PATH, 'utf8');
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

export function saveSettingsToCSV(settings) {
    try {
        if (!fs.existsSync(DATABASE_DIR)) {
            fs.mkdirSync(DATABASE_DIR, { recursive: true });
        }

        const headers = Object.keys(settings).join(',');
        const values = Object.values(settings).map(v => {
            if (typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))) {
                return '"' + v.replace(/"/g, '""') + '"';
            }
            return v;
        }).join(',');

        const csvContent = `${headers}\n${values}\n`;
        fs.writeFileSync(SETTINGS_FILE_PATH, csvContent);

        console.log('Saved settings to CSV:', settings);
        return true;
    } catch (error) {
        console.error('Error saving settings to CSV:', error);
        return false;
    }
}

export function loadDevicePowerModesFromCSV() {
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

export function saveDevicePowerModesToCSV() {
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

export { calculateHoursSinceLastTransition };
