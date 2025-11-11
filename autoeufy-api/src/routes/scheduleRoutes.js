import express from 'express';
import { 
    loadSchedules, 
    addSchedule, 
    updateSchedule, 
    deleteSchedule, 
    getSchedule,
    validateSchedule 
} from '../utils/scheduleStorage.js';
import { reloadSchedules, checkScheduleCompliance, checkSchedulesNow } from '../services/schedulerService.js';

const router = express.Router();

router.get('/schedules', (req, res) => {
    try {
        const schedules = loadSchedules();
        res.send({
            success: true,
            count: schedules.length,
            schedules
        });
    } catch (error) {
        console.error('Error getting schedules:', error);
        res.status(500).send({ 
            success: false, 
            error: error.message 
        });
    }
});

router.get('/schedules/:id', (req, res) => {
    try {
        const schedule = getSchedule(req.params.id);
        
        if (!schedule) {
            return res.status(404).send({ 
                success: false, 
                error: 'Schedule not found' 
            });
        }

        res.send({
            success: true,
            schedule
        });
    } catch (error) {
        console.error('Error getting schedule:', error);
        res.status(500).send({ 
            success: false, 
            error: error.message 
        });
    }
});

router.post('/schedules', (req, res) => {
    try {
        const scheduleData = req.body;

        const validation = validateSchedule(scheduleData);
        if (!validation.valid) {
            return res.status(400).send({
                success: false,
                error: 'Invalid schedule data',
                validationErrors: validation.errors
            });
        }

        const newSchedule = addSchedule(scheduleData);
        
        reloadSchedules();

        res.status(201).send({
            success: true,
            message: 'Schedule created successfully',
            schedule: newSchedule
        });
    } catch (error) {
        console.error('Error creating schedule:', error);
        res.status(500).send({ 
            success: false, 
            error: error.message 
        });
    }
});

router.put('/schedules/:id', (req, res) => {
    try {
        const scheduleId = req.params.id;
        const updates = req.body;

        const existingSchedule = getSchedule(scheduleId);
        if (!existingSchedule) {
            return res.status(404).send({ 
                success: false, 
                error: 'Schedule not found' 
            });
        }

        const mergedSchedule = { ...existingSchedule, ...updates };
        const validation = validateSchedule(mergedSchedule);
        if (!validation.valid) {
            return res.status(400).send({
                success: false,
                error: 'Invalid schedule data',
                validationErrors: validation.errors
            });
        }

        const updatedSchedule = updateSchedule(scheduleId, updates);
        
        reloadSchedules();

        res.send({
            success: true,
            message: 'Schedule updated successfully',
            schedule: updatedSchedule
        });
    } catch (error) {
        console.error('Error updating schedule:', error);
        res.status(500).send({ 
            success: false, 
            error: error.message 
        });
    }
});

router.delete('/schedules/:id', (req, res) => {
    try {
        const scheduleId = req.params.id;
        const deleted = deleteSchedule(scheduleId);

        if (!deleted) {
            return res.status(404).send({ 
                success: false, 
                error: 'Schedule not found' 
            });
        }

        reloadSchedules();

        res.send({
            success: true,
            message: 'Schedule deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).send({ 
            success: false, 
            error: error.message 
        });
    }
});

router.patch('/schedules/:id/toggle', (req, res) => {
    try {
        const scheduleId = req.params.id;
        const schedule = getSchedule(scheduleId);

        if (!schedule) {
            return res.status(404).send({ 
                success: false, 
                error: 'Schedule not found' 
            });
        }

        const updatedSchedule = updateSchedule(scheduleId, {
            enabled: !schedule.enabled
        });

        reloadSchedules();

        res.send({
            success: true,
            message: `Schedule ${updatedSchedule.enabled ? 'enabled' : 'disabled'}`,
            schedule: updatedSchedule
        });
    } catch (error) {
        console.error('Error toggling schedule:', error);
        res.status(500).send({ 
            success: false, 
            error: error.message 
        });
    }
});

router.get('/schedules/compliance', async (req, res) => {
    try {
        const result = await checkScheduleCompliance();
        res.send(result);
    } catch (error) {
        console.error('Error checking schedule compliance:', error);
        res.status(500).send({ 
            success: false, 
            error: error.message,
            compliance: null
        });
    }
});

router.post('/schedules/trigger', async (req, res) => {
    try {
        console.log('Manual schedule trigger requested');
        await checkSchedulesNow();
        res.send({
            success: true,
            message: 'Schedule check triggered successfully'
        });
    } catch (error) {
        console.error('Error triggering schedule check:', error);
        res.status(500).send({ 
            success: false, 
            error: error.message
        });
    }
});

router.get('/schedules/info/example', (req, res) => {
    res.send({
        success: true,
        example: {
            name: "Weekday Work Hours",
            description: "Set cameras to customized recording during work hours",
            days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            timeRanges: [
                { start: "06:00", end: "10:00" },
                { start: "12:00", end: "14:00" },
                { start: "20:00", end: "23:59" }
            ],
            mode: 2,
            allOtherMotions: true,
            cameras: [],
            enabled: true
        },
        modeOptions: {
            0: "Optimal Surveillance (Battery Saving)",
            2: "Customized Recording"
        },
        validDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        timeFormat: "HH:MM (24-hour format, e.g., 06:00, 14:30, 23:59)",
        notes: [
            "Leave cameras array empty to apply to all cameras",
            "Time ranges can span across days (e.g., 23:00 to 01:00)",
            "Multiple time ranges are supported for each schedule",
            "Schedules are checked every minute"
        ]
    });
});

export default router;
