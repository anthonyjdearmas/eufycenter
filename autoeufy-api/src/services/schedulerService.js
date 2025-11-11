import { loadSchedules } from '../utils/scheduleStorage.js';
import { ws, isConnected } from '../config/state.js';
import { getAllDevices } from './deviceService.js';
import { setDevicePowerMode, getModeNameForLogging } from '../utils/devicePowerModes.js';
import { logTransition, loadSettingsFromCSV } from '../utils/csvLogger.js';
import WebSocket from 'ws';

let scheduledTasks = new Map();
let checkInterval = null;
let isSchedulerRunning = false;

export function startScheduler() {
    if (isSchedulerRunning) {
        console.log('Scheduler is already running - skipping duplicate start');
        return;
    }
    
    console.log('Starting camera mode scheduler...');
    
    checkInterval = setInterval(() => {
        checkAndExecuteSchedules();
    }, 60000);

    checkAndExecuteSchedules();
    isSchedulerRunning = true;
    
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
    isSchedulerRunning = false;
    
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

    let activeScheduleFound = false;

    for (const schedule of schedules) {
        if (!schedule.enabled) {
            continue;
        }

        const shouldExecute = shouldExecuteSchedule(schedule, currentDay, currentTime);
        
        if (shouldExecute) {
            activeScheduleFound = true;
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

    // If no active schedules found, revert cameras to default mode (Optimal Surveillance)
    if (!activeScheduleFound) {
        const revertKey = `revert_${currentDay}_${currentTime}`;
        const lastRevert = scheduledTasks.get(revertKey);
        
        if (!lastRevert || (now - lastRevert) >= 120000) {
            console.log('No active schedules found - reverting cameras to default mode (Optimal Surveillance)');
            await revertCamerasToDefaultMode();
            scheduledTasks.set(revertKey, now);
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

        const settings = loadSettingsFromCSV();
        let selectedCameras = [];
        
        if (settings && settings.selectedCameras) {
            try {
                selectedCameras = typeof settings.selectedCameras === 'string' 
                    ? JSON.parse(settings.selectedCameras) 
                    : settings.selectedCameras;
            } catch (e) {
                console.error('Error parsing selectedCameras:', e);
            }
        }

        const allDevices = await getAllDevices();
        let cameras = allDevices.filter(device => device.type === 'device');

        if (selectedCameras.length > 0) {
            cameras = cameras.filter(camera => selectedCameras.includes(camera.serialNumber));
            console.log(`Filtered to ${cameras.length} selected cameras from settings`);
        }

        if (schedule.cameras && Array.isArray(schedule.cameras) && schedule.cameras.length > 0) {
            cameras = cameras.filter(camera => schedule.cameras.includes(camera.serialNumber));
            console.log(`Further filtered to ${cameras.length} cameras specified in schedule`);
        } else {
            console.log(`Schedule has no specific cameras configured - using all selected cameras (${cameras.length})`);
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
                // Use the allOtherMotions setting from the schedule configuration
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

async function revertCamerasToDefaultMode() {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('Cannot revert cameras: WebSocket not connected');
            return;
        }

        if (!isConnected) {
            console.error('Cannot revert cameras: Not connected to Eufy service');
            return;
        }

        const settings = loadSettingsFromCSV();
        let selectedCameras = [];
        
        if (settings && settings.selectedCameras) {
            try {
                selectedCameras = typeof settings.selectedCameras === 'string' 
                    ? JSON.parse(settings.selectedCameras) 
                    : settings.selectedCameras;
            } catch (e) {
                console.error('Error parsing selectedCameras:', e);
            }
        }

        const allDevices = await getAllDevices();
        let cameras = allDevices.filter(device => device.type === 'device');

        if (selectedCameras.length > 0) {
            cameras = cameras.filter(camera => selectedCameras.includes(camera.serialNumber));
            console.log(`Reverting ${cameras.length} selected cameras to default mode`);
        }

        if (cameras.length === 0) {
            console.log('No cameras found to revert to default mode');
            return;
        }

        const results = [];
        let successCount = 0;
        let changesCount = 0;

        for (const camera of cameras) {
            try {
                const result = await setCameraMode(camera, 0, false); // Mode 0 = Optimal Surveillance, keep motion in battery saver mode
                results.push(result);
                
                if (result.success) {
                    successCount++;
                    if (result.changesMade) {
                        changesCount++;
                    }
                }
            } catch (error) {
                console.error(`Error reverting mode for ${camera.name}:`, error.message);
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
                transitionType: 'Schedule Revert',
                fromMode: 'Various',
                toMode: getModeNameForLogging(0),
                camerasAffected: `${changesCount} cameras: ${cameraNames}`,
                notes: `${successCount}/${cameras.length} cameras reverted to default mode`
            });
        }

        console.log(`Default mode revert completed: ${successCount}/${cameras.length} successful, ${changesCount} changes made`);

    } catch (error) {
        console.error('Error reverting cameras to default mode:', error);
    }
}

export async function checkScheduleCompliance() {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return {
                success: false,
                error: 'WebSocket not connected',
                compliance: null
            };
        }

        if (!isConnected) {
            return {
                success: false,
                error: 'Not connected to Eufy service',
                compliance: null
            };
        }

        const schedules = loadSchedules();
        const now = new Date();
        const currentDay = getDayName(now.getDay());
        const currentTime = formatTime(now.getHours(), now.getMinutes());

        // Determine what the expected mode should be
        let expectedMode = 0; // Default to Optimal Surveillance
        let expectedAllOtherMotions = false; // Default motion detection setting
        let activeSchedule = null;

        for (const schedule of schedules) {
            if (!schedule.enabled) {
                continue;
            }

            const shouldExecute = shouldExecuteSchedule(schedule, currentDay, currentTime);
            
            if (shouldExecute) {
                expectedMode = schedule.mode;
                expectedAllOtherMotions = schedule.allOtherMotions;
                activeSchedule = schedule;
                break; // Use first matching schedule
            }
        }

        // Get current camera statuses
        const settings = loadSettingsFromCSV();
        let selectedCameras = [];
        
        if (settings && settings.selectedCameras) {
            try {
                selectedCameras = typeof settings.selectedCameras === 'string' 
                    ? JSON.parse(settings.selectedCameras) 
                    : settings.selectedCameras;
            } catch (e) {
                console.error('Error parsing selectedCameras:', e);
            }
        }

        const allDevices = await getAllDevices();
        let cameras = allDevices.filter(device => device.type === 'device');

        if (selectedCameras.length > 0) {
            cameras = cameras.filter(camera => selectedCameras.includes(camera.serialNumber));
        }

        if (cameras.length === 0) {
            return {
                success: true,
                compliance: {
                    isCompliant: true,
                    expectedMode,
                    expectedAllOtherMotions,
                    activeSchedule: activeSchedule ? activeSchedule.name : null,
                    cameras: [],
                    totalCameras: 0,
                    compliantCameras: 0
                }
            };
        }

        const cameraStatuses = [];
        let compliantCount = 0;

        for (const camera of cameras) {
            try {
                const properties = await getDeviceProperties(camera.serialNumber);
                
                const isCompliant = properties.powerWorkingMode === expectedMode && 
                                  (expectedAllOtherMotions === undefined || properties.motionDetectionTypeAllOtherMotions === expectedAllOtherMotions);
                
                if (isCompliant) {
                    compliantCount++;
                }

                cameraStatuses.push({
                    name: camera.name,
                    serialNumber: camera.serialNumber,
                    currentMode: properties.powerWorkingMode,
                    currentAllOtherMotions: properties.motionDetectionTypeAllOtherMotions,
                    expectedMode,
                    expectedAllOtherMotions,
                    isCompliant
                });
            } catch (error) {
                console.error(`Error checking compliance for ${camera.name}:`, error.message);
                cameraStatuses.push({
                    name: camera.name,
                    serialNumber: camera.serialNumber,
                    currentMode: null,
                    currentAllOtherMotions: null,
                    expectedMode,
                    expectedAllOtherMotions,
                    isCompliant: false,
                    error: error.message
                });
            }
        }

        return {
            success: true,
            compliance: {
                isCompliant: compliantCount === cameras.length,
                expectedMode,
                expectedAllOtherMotions,
                activeSchedule: activeSchedule ? activeSchedule.name : null,
                cameras: cameraStatuses,
                totalCameras: cameras.length,
                compliantCameras: compliantCount
            }
        };

    } catch (error) {
        console.error('Error checking schedule compliance:', error);
        return {
            success: false,
            error: error.message,
            compliance: null
        };
    }
}
