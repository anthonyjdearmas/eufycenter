# Camera Mode Scheduling System - Implementation Summary

## What Was Created

A complete scheduling system that allows automatic camera mode changes based on time and day of week.

## Files Created

### 1. Core Scheduling Logic
- **`src/utils/scheduleStorage.js`** - Schedule data persistence and validation
  - Load/save schedules to JSON file
  - CRUD operations for schedules
  - Schedule validation with detailed error messages
  - Generates unique schedule IDs

- **`src/services/schedulerService.js`** - Background scheduler service
  - Runs every minute to check schedules
  - Executes matching schedules automatically
  - Prevents duplicate executions within the same minute
  - Integrates with existing camera control system
  - Logs all transitions to CSV

- **`src/routes/scheduleRoutes.js`** - REST API endpoints
  - GET /api/schedules - List all schedules
  - POST /api/schedules - Create new schedule
  - GET /api/schedules/:id - Get specific schedule
  - PUT /api/schedules/:id - Update schedule
  - DELETE /api/schedules/:id - Delete schedule
  - PATCH /api/schedules/:id/toggle - Enable/disable schedule
  - GET /api/schedules/info/example - Get example format

### 2. Documentation
- **`SCHEDULING_GUIDE.md`** - Complete user guide with examples
- **`example-schedule-requests.http`** - HTTP request examples for testing
- **`test-schedule.js`** - Automated test script
- **`SCHEDULE_SYSTEM_SUMMARY.md`** - This file

### 3. Modified Files
- **`app.js`** - Added scheduler initialization and routes
- **`package.json`** - Added node-cron dependency
- **`README.md`** - Added scheduling endpoints documentation

## Key Features

### Multiple Time Ranges
Each schedule can have multiple time windows:
```json
"timeRanges": [
  { "start": "06:00", "end": "10:00" },
  { "start": "12:00", "end": "14:00" },
  { "start": "20:00", "end": "23:59" }
]
```

### Day Selection
Choose specific days for each schedule:
```json
"days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
```

### Camera Selection
- Apply to all cameras: `"cameras": []`
- Apply to specific cameras: `"cameras": ["T8113N63212153EF", "T8113N63212153E0"]`

### Two Camera Modes
- **Mode 0**: Optimal Surveillance (Battery Saving)
- **Mode 2**: Customized Recording (High Quality)

### Enable/Disable
Temporarily disable schedules without deleting them

## Example Use Case (Your Request)

Monday through Friday, customized recording from 6AM-10AM, 12PM-2PM, and 8PM-11:59PM:

```json
{
  "name": "Weekday Work Hours",
  "description": "Customized recording during work hours",
  "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "timeRanges": [
    { "start": "06:00", "end": "10:00" },
    { "start": "12:00", "end": "14:00" },
    { "start": "20:00", "end": "23:59" }
  ],
  "mode": 2,
  "allOtherMotions": true,
  "cameras": [],
  "enabled": true
}
```

## How to Use

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

The scheduler will automatically start 5 seconds after the server starts.

### 3. Create a Schedule
```bash
POST http://localhost:3000/api/schedules
Content-Type: application/json

{
  "name": "Your Schedule Name",
  "days": ["monday", "tuesday"],
  "timeRanges": [
    { "start": "06:00", "end": "10:00" }
  ],
  "mode": 2,
  "allOtherMotions": true,
  "cameras": [],
  "enabled": true
}
```

### 4. View All Schedules
```bash
GET http://localhost:3000/api/schedules
```

### 5. Monitor Execution
- Check server console logs for schedule execution
- View `database/camera_transitions.csv` for detailed logs

## Data Storage

### Schedules
Stored in: `database/schedules.json`

Format:
```json
[
  {
    "id": "schedule_1699564800000_abc123",
    "name": "Weekday Work Hours",
    "description": "...",
    "days": [...],
    "timeRanges": [...],
    "mode": 2,
    "allOtherMotions": true,
    "cameras": [],
    "enabled": true,
    "createdAt": "2024-11-09T20:00:00.000Z"
  }
]
```

### Execution Logs
All schedule executions are logged to: `database/camera_transitions.csv`

## Technical Details

### Scheduler Logic
1. Runs every 60 seconds (1 minute)
2. Loads all schedules from JSON file
3. Checks each enabled schedule:
   - Does current day match schedule days?
   - Does current time fall within any time range?
4. If match found:
   - Check if already executed in this minute (prevents duplicates)
   - Get cameras (all or filtered by serial numbers)
   - Check current camera states
   - Change modes only if needed
   - Log transition to CSV

### Time Matching
- Uses 24-hour format (HH:MM)
- Converts times to minutes for comparison
- Supports overnight ranges (e.g., 23:00 to 01:00)

### Integration
- Uses existing WebSocket connection to Eufy service
- Uses existing camera control functions
- Uses existing CSV logging system
- Respects connection status before executing

## Testing

### Quick Test
Run the test script to create a schedule that executes in 2 minutes:
```bash
node test-schedule.js
```

### Manual Test
1. Create a schedule with current time + 2 minutes
2. Watch server logs
3. Check `database/camera_transitions.csv`

### Example Test Schedule
```json
{
  "name": "Test Schedule",
  "days": ["monday"],
  "timeRanges": [
    { "start": "14:30", "end": "14:35" }
  ],
  "mode": 2,
  "allOtherMotions": true,
  "cameras": [],
  "enabled": true
}
```

## Troubleshooting

### Schedule Not Executing
- ✅ Check schedule is enabled
- ✅ Verify days and times are correct
- ✅ Ensure WebSocket is connected
- ✅ Check server logs for errors

### Wrong Cameras Affected
- ✅ Verify camera serial numbers
- ✅ Empty array = all cameras
- ✅ Check cameras exist in system

### Mode Not Changing
- ✅ Verify mode value (0 or 2)
- ✅ Check WebSocket connection
- ✅ Review CSV logs

## Future Enhancements

Possible additions:
- Web UI for schedule management
- Schedule conflict detection
- Schedule preview/simulation
- More granular time intervals (seconds)
- Holiday/exception handling
- Schedule templates
- Notification on execution
- Execution history API

## Dependencies

- **node-cron**: ^3.0.3 (installed but not actively used, available for future enhancements)
- Uses existing dependencies: express, ws, eufy-security-ws

## API Response Examples

### Success Response
```json
{
  "success": true,
  "message": "Schedule created successfully",
  "schedule": {
    "id": "schedule_1699564800000_abc123",
    "name": "Weekday Work Hours",
    ...
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Invalid schedule data",
  "validationErrors": [
    "Days array is required and must contain at least one day"
  ]
}
```

## Summary

The scheduling system is fully functional and ready to use. It provides:
- ✅ Time-based automation
- ✅ Day-of-week selection
- ✅ Multiple time ranges per schedule
- ✅ Camera-specific or all-camera targeting
- ✅ Enable/disable without deletion
- ✅ Complete CRUD API
- ✅ Automatic execution every minute
- ✅ CSV logging of all transitions
- ✅ Comprehensive documentation
- ✅ Test utilities

You can now create schedules via the API and they will execute automatically!
