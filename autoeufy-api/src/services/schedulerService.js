import { loadSchedules } from '../utils/scheduleStorage.js';
import { ws, isConnected } from '../config/state.js';
import { getAllDevices } from './deviceService.js';
import { setDevicePowerMode, getModeNameForLogging } from '../utils/devicePowerModes.js';
import { logTransition, loadSettingsFromCSV } from '../utils/csvLogger.js';
import WebSocket from 'ws';

let scheduledTasks = new Map();
let checkInterval = null;

export function startScheduler() {
    console.log('Starting camera mode scheduler...');
    
    checkInterval = setInterval(() => {
        checkAndExecuteSchedules();
    }, 60000);

    checkAndExecuteSchedules();
    
    console.log('Scheduler started - checking every minute');
}

export function stopScheduler() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    
    scheduledTasks.forEach(task => {
        if (task.stop) {
            task.stop();
        }
    });
    scheduledTasks.clear();
    
    console.log('Scheduler stopped');
}

export function reloadSchedules() {
    console.log('Reloading schedules...');
    checkAndExecuteSchedules();
}

export async function checkSchedulesNow() {
    console.log('Immediate schedule check triggered...');
    await checkAndExecuteSchedules();
}

async function checkAndExecuteSchedules() {
    const settings = loadSettingsFromCSV();
    
    if (settings && settings.overrideSchedule === true) {
        console.log('Schedule execution skipped: Override Schedule is enabled');
        return;
    }

    const schedules = loadSchedules();
    const now = new Date();
    const currentDay = getDayName(now.getDay());
    const currentTime = formatTime(now.getHours(), now.getMinutes());

    console.log(`Checking schedules at ${currentTime} on ${currentDay}`);

    for (const schedule of schedules) {
        if (!schedule.enabled) {
            continue;
        }

        const shouldExecute = shouldExecuteSchedule(schedule, currentDay, currentTime);
        
        if (shouldExecute) {
            const lastExecutionKey = `${schedule.id}_${currentDay}_${currentTime}`;
            const lastExecution = scheduledTasks.get(lastExecutionKey);
            
            if (lastExecution && (now - lastExecution) < 120000) {
                continue;
            }

            console.log(`Executing schedule: ${schedule.name}`);
            await executeSchedule(schedule);
            scheduledTasks.set(lastExecutionKey, now);
        }
    }
}

function shouldExecuteSchedule(schedule, currentDay, currentTime) {
    const dayMatch = schedule.days.some(day => day.toLowerCase() === currentDay.toLowerCase());
    
    if (!dayMatch) {
        return false;
    }

    return schedule.timeRanges.some(range => {
        const startMinutes = timeToMinutes(range.start);
        const endMinutes = timeToMinutes(range.end);
        const currentMinutes = timeToMinutes(currentTime);

        if (endMinutes < startMinutes) {
            return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
        }
        
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    });
}

async function executeSchedule(schedule) {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error(`Cannot execute schedule "${schedule.name}": WebSocket not connected`);
            return;
        }

        if (!isConnected) {
            console.error(`Cannot execute schedule "${schedule.name}": Not connected to Eufy service`);
            return;
        }

        console.log(`Executing schedule: ${schedule.name}`);
        console.log(`Target mode: ${schedule.mode}, All other motions: ${schedule.allOtherMotions}`);

        const allDevices = await getAllDevices();
        let cameras = allDevices.filter(device => device.type === 'device');

        if (schedule.cameras && Array.isArray(schedule.cameras) && schedule.cameras.length > 0) {
            cameras = cameras.filter(camera => schedule.cameras.includes(camera.serialNumber));
            console.log(`Filtered to ${cameras.length} scheduled cameras`);
        }

        if (cameras.length === 0) {
            console.error(`No cameras found for schedule "${schedule.name}"`);
            return;
        }

        const results = [];
        let successCount = 0;
        let changesCount = 0;

        for (const camera of cameras) {
            try {
                const result = await setCameraMode(camera, schedule.mode, schedule.allOtherMotions);
                results.push(result);
                
                if (result.success) {
                    successCount++;
                    if (result.changesMade) {
                        changesCount++;
                    }
                }
            } catch (error) {
                console.error(`Error setting mode for ${camera.name}:`, error.message);
                results.push({
                    camera: camera.name,
                    success: false,
                    error: error.message
                });
            }
        }

        if (changesCount > 0) {
            const cameraNames = results
                .filter(r => r.changesMade)
                .map(r => r.camera)
                .join('; ');

            logTransition({
                transitionType: `Scheduled: ${schedule.name}`,
                fromMode: 'Various',
                toMode: getModeNameForLogging(schedule.mode),
                camerasAffected: `${changesCount} cameras: ${cameraNames}`,
                notes: `${successCount}/${cameras.length} cameras successful`
            });
        }

        console.log(`Schedule "${schedule.name}" completed: ${successCount}/${cameras.length} successful, ${changesCount} changes made`);

    } catch (error) {
        console.error(`Error executing schedule "${schedule.name}":`, error);
    }
}

async function setCameraMode(camera, targetMode, targetAllOtherMotions) {
    return new Promise(async (resolve) => {
        try {
            const properties = await getDeviceProperties(camera.serialNumber);
            
            let changesMade = false;
            const changes = [];

            if (properties.powerWorkingMode !== targetMode) {
                await setDeviceProperty(camera.serialNumber, 'powerWorkingMode', targetMode);
                changesMade = true;
                changes.push(`Power mode: ${properties.powerWorkingMode} → ${targetMode}`);
                setDevicePowerMode(camera.serialNumber, targetMode);
            }

            if (properties.motionDetection !== true) {
                await setDeviceProperty(camera.serialNumber, 'motionDetection', true);
                changesMade = true;
                changes.push('Motion detection enabled');
            }

            if (targetAllOtherMotions !== undefined && properties.motionDetectionTypeAllOtherMotions !== targetAllOtherMotions) {
                await setDeviceProperty(camera.serialNumber, 'motionDetectionTypeAllOtherMotions', targetAllOtherMotions);
                changesMade = true;
                changes.push(`All other motions: ${properties.motionDetectionTypeAllOtherMotions} → ${targetAllOtherMotions}`);
            }

            resolve({
                camera: camera.name,
                serialNumber: camera.serialNumber,
                success: true,
                changesMade,
                changes
            });

        } catch (error) {
            resolve({
                camera: camera.name,
                serialNumber: camera.serialNumber,
                success: false,
                error: error.message
            });
        }
    });
}

function getDeviceProperties(serialNumber) {
    return new Promise((resolve, reject) => {
        const requestId = Date.now();
        const messageId = `get_props_${serialNumber}_${requestId}`;

        const messageHandler = (data) => {
            const message = JSON.parse(data.toString());
            if (message.messageId === messageId) {
                ws.removeListener('message', messageHandler);
                if (message.success && (message.properties || (message.result && message.result.properties))) {
                    const properties = message.properties || message.result.properties;
                    resolve(properties);
                } else {
                    reject(new Error(`Failed to get properties for ${serialNumber}`));
                }
            }
        };

        ws.on('message', messageHandler);

        const message = {
            messageId,
            command: 'device.get_properties',
            serialNumber
        };
        ws.send(JSON.stringify(message));

        setTimeout(() => {
            ws.removeListener('message', messageHandler);
            reject(new Error(`Timeout getting properties for ${serialNumber}`));
        }, 5000);
    });
}

function setDeviceProperty(serialNumber, propertyName, value) {
    return new Promise((resolve, reject) => {
        const requestId = Date.now();
        const messageId = `set_prop_${serialNumber}_${propertyName}_${requestId}`;

        const messageHandler = (data) => {
            const message = JSON.parse(data.toString());
            if (message.messageId === messageId) {
                ws.removeListener('message', messageHandler);
                if (message.success) {
                    resolve();
                } else {
                    reject(new Error(`Failed to set ${propertyName} for ${serialNumber}`));
                }
            }
        };

        ws.on('message', messageHandler);

        const message = {
            messageId,
            command: 'device.set_property',
            serialNumber,
            name: propertyName,
            value
        };
        ws.send(JSON.stringify(message));

        setTimeout(() => {
            ws.removeListener('message', messageHandler);
            reject(new Error(`Timeout setting ${propertyName} for ${serialNumber}`));
        }, 5000);
    });
}

function getDayName(dayIndex) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[dayIndex];
}

function formatTime(hours, minutes) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}
