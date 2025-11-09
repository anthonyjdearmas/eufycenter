import fs from 'fs';
import path from 'path';
import { DATABASE_DIR } from '../config/constants.js';

const SCHEDULES_FILE_PATH = path.join(DATABASE_DIR, 'schedules.json');

export function loadSchedules() {
    try {
        if (!fs.existsSync(DATABASE_DIR)) {
            fs.mkdirSync(DATABASE_DIR, { recursive: true });
        }

        if (!fs.existsSync(SCHEDULES_FILE_PATH)) {
            const defaultSchedules = [];
            fs.writeFileSync(SCHEDULES_FILE_PATH, JSON.stringify(defaultSchedules, null, 2));
            return defaultSchedules;
        }

        const data = fs.readFileSync(SCHEDULES_FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading schedules:', error);
        return [];
    }
}

export function saveSchedules(schedules) {
    try {
        if (!fs.existsSync(DATABASE_DIR)) {
            fs.mkdirSync(DATABASE_DIR, { recursive: true });
        }

        fs.writeFileSync(SCHEDULES_FILE_PATH, JSON.stringify(schedules, null, 2));
        console.log('Schedules saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving schedules:', error);
        return false;
    }
}

export function addSchedule(schedule) {
    const schedules = loadSchedules();
    const newSchedule = {
        id: generateScheduleId(),
        ...schedule,
        createdAt: new Date().toISOString(),
        enabled: schedule.enabled !== undefined ? schedule.enabled : true
    };
    schedules.push(newSchedule);
    saveSchedules(schedules);
    return newSchedule;
}

export function updateSchedule(id, updates) {
    const schedules = loadSchedules();
    const index = schedules.findIndex(s => s.id === id);
    
    if (index === -1) {
        return null;
    }

    schedules[index] = {
        ...schedules[index],
        ...updates,
        id: schedules[index].id,
        createdAt: schedules[index].createdAt,
        updatedAt: new Date().toISOString()
    };

    saveSchedules(schedules);
    return schedules[index];
}

export function deleteSchedule(id) {
    const schedules = loadSchedules();
    const filteredSchedules = schedules.filter(s => s.id !== id);
    
    if (filteredSchedules.length === schedules.length) {
        return false;
    }

    saveSchedules(filteredSchedules);
    return true;
}

export function getSchedule(id) {
    const schedules = loadSchedules();
    return schedules.find(s => s.id === id);
}

function generateScheduleId() {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function validateSchedule(schedule) {
    const errors = [];

    if (!schedule.name || typeof schedule.name !== 'string') {
        errors.push('Schedule name is required and must be a string');
    }

    if (!schedule.days || !Array.isArray(schedule.days) || schedule.days.length === 0) {
        errors.push('Days array is required and must contain at least one day');
    }

    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (schedule.days && Array.isArray(schedule.days)) {
        const invalidDays = schedule.days.filter(day => !validDays.includes(day.toLowerCase()));
        if (invalidDays.length > 0) {
            errors.push(`Invalid days: ${invalidDays.join(', ')}. Valid days are: ${validDays.join(', ')}`);
        }
    }

    if (!schedule.timeRanges || !Array.isArray(schedule.timeRanges) || schedule.timeRanges.length === 0) {
        errors.push('Time ranges array is required and must contain at least one time range');
    }

    if (schedule.timeRanges && Array.isArray(schedule.timeRanges)) {
        schedule.timeRanges.forEach((range, index) => {
            if (!range.start || !isValidTime(range.start)) {
                errors.push(`Time range ${index + 1}: Invalid start time format. Use HH:MM (24-hour format)`);
            }
            if (!range.end || !isValidTime(range.end)) {
                errors.push(`Time range ${index + 1}: Invalid end time format. Use HH:MM (24-hour format)`);
            }
        });
    }

    if (!schedule.mode || typeof schedule.mode !== 'number') {
        errors.push('Mode is required and must be a number (0=Optimal Surveillance, 2=Customized Recording)');
    }

    if (schedule.mode !== undefined && schedule.mode !== 0 && schedule.mode !== 2) {
        errors.push('Mode must be either 0 (Optimal Surveillance) or 2 (Customized Recording)');
    }

    if (schedule.allOtherMotions !== undefined && typeof schedule.allOtherMotions !== 'boolean') {
        errors.push('allOtherMotions must be a boolean value');
    }

    if (schedule.cameras && !Array.isArray(schedule.cameras)) {
        errors.push('Cameras must be an array of serial numbers');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

function isValidTime(timeString) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeString);
}
