import express from 'express';
import fs from 'fs';
import { CSV_FILE_PATH } from '../config/constants.js';
import { loadSettingsFromCSV, saveSettingsToCSV, calculateHoursSinceLastTransition } from '../utils/csvLogger.js';
import { checkSchedulesNow } from '../services/schedulerService.js';

const router = express.Router();

router.get('/settings', (req, res) => {
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

router.post('/settings', async (req, res) => {
    try {
        const newSettings = req.body;

        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).send({ error: 'Invalid settings data' });
        }

        const existingSettings = loadSettingsFromCSV() || {};
        const wasOverrideEnabled = existingSettings.overrideSchedule === true;
        const isOverrideEnabled = newSettings.overrideSchedule === true;

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
            if (wasOverrideEnabled && !isOverrideEnabled) {
                console.log('Override disabled - checking schedules immediately');
                checkSchedulesNow();
            }

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

router.get('/transitions', (req, res) => {
    try {
        if (!fs.existsSync(CSV_FILE_PATH)) {
            return res.send({
                transitions: [],
                message: 'No transition logs found'
            });
        }

        const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
        const lines = csvContent.trim().split('\n');

        if (lines.length <= 1) {
            return res.send({
                transitions: [],
                message: 'No transition data available'
            });
        }

        const parseCSVLine = (line) => {
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
        };

        const transitions = lines.slice(1)
            .filter(line => line.trim().length > 0)
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
            }).reverse();

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


export default router;
