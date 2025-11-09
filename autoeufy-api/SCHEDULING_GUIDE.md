# Camera Mode Scheduling System

## Overview

The scheduling system allows you to automatically switch camera modes at specific times on specific days. This is perfect for scenarios like:
- Setting cameras to customized recording during work hours
- Switching to battery-saving mode overnight
- Different schedules for weekdays vs weekends

## Features

- **Multiple Time Ranges**: Set multiple time windows per schedule (e.g., 6AM-10AM, 12PM-2PM, 8PM-11:59PM)
- **Day Selection**: Choose specific days of the week for each schedule
- **Camera Selection**: Apply schedules to all cameras or specific ones
- **Enable/Disable**: Temporarily disable schedules without deleting them
- **Automatic Execution**: Schedules are checked every minute and executed automatically

## API Endpoints

### Get All Schedules
```
GET /api/schedules
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "schedules": [...]
}
```

### Get Single Schedule
```
GET /api/schedules/:id
```

### Create Schedule
```
POST /api/schedules
```

**Request Body:**
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

**Field Descriptions:**
- `name` (required): A descriptive name for the schedule
- `description` (optional): Additional details about the schedule
- `days` (required): Array of day names (lowercase): monday, tuesday, wednesday, thursday, friday, saturday, sunday
- `timeRanges` (required): Array of time range objects with `start` and `end` times in HH:MM format (24-hour)
- `mode` (required): Camera mode - `0` for Optimal Surveillance (Battery Saving), `2` for Customized Recording
- `allOtherMotions` (optional): Boolean to enable/disable all other motion detection types
- `cameras` (optional): Array of camera serial numbers. Leave empty `[]` to apply to all cameras
- `enabled` (optional): Boolean to enable/disable the schedule (default: true)

### Update Schedule
```
PUT /api/schedules/:id
```

**Request Body:** Same as create, but all fields are optional (only include fields you want to update)

### Delete Schedule
```
DELETE /api/schedules/:id
```

### Toggle Schedule Enable/Disable
```
PATCH /api/schedules/:id/toggle
```

### Get Example Schedule
```
GET /api/schedules/info/example
```

Returns a complete example schedule with all available options and documentation.

## Camera Modes

- **Mode 0**: Optimal Surveillance (Battery Saving)
  - Lower recording quality
  - Extended battery life
  - Motion detection still active

- **Mode 2**: Customized Recording
  - Higher recording quality
  - More frequent recordings
  - Full motion detection features

## Example Schedules

### Example 1: Weekday Work Hours
```json
{
  "name": "Weekday Work Hours",
  "description": "High quality recording during work hours",
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

### Example 2: Weekend Battery Saving
```json
{
  "name": "Weekend Battery Saving",
  "description": "Save battery on weekends",
  "days": ["saturday", "sunday"],
  "timeRanges": [
    { "start": "00:00", "end": "23:59" }
  ],
  "mode": 0,
  "allOtherMotions": false,
  "cameras": [],
  "enabled": true
}
```

### Example 3: Nighttime for Specific Cameras
```json
{
  "name": "Backyard Night Mode",
  "description": "Enhanced recording for backyard at night",
  "days": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  "timeRanges": [
    { "start": "22:00", "end": "06:00" }
  ],
  "mode": 2,
  "allOtherMotions": true,
  "cameras": ["T8113N63212153EF"],
  "enabled": true
}
```

## Time Format

- Use 24-hour format: `HH:MM`
- Examples: `06:00`, `14:30`, `23:59`
- Time ranges can span across days (e.g., `23:00` to `01:00` for overnight)

## How It Works

1. The scheduler checks all enabled schedules every minute
2. For each schedule, it checks if:
   - The current day matches one of the schedule's days
   - The current time falls within any of the schedule's time ranges
3. If both conditions are met, the schedule executes:
   - Gets all cameras (or filters to specified cameras)
   - Checks current camera states
   - Changes modes only if needed
   - Logs all transitions to the CSV log file
4. Schedules won't re-execute within the same minute to prevent duplicates

## Storage

Schedules are stored in: `database/schedules.json`

All schedule executions are logged to: `database/camera_transitions.csv`

## Tips

1. **Overlapping Schedules**: If multiple schedules overlap, they will all execute. The last one to run will determine the final camera state.

2. **All Cameras vs Specific**: Leave the `cameras` array empty to apply to all cameras, or specify serial numbers for targeted control.

3. **Testing**: Create a schedule with the current time +2 minutes to test functionality.

4. **Disable vs Delete**: Use the toggle endpoint to temporarily disable schedules without losing the configuration.

5. **Time Ranges**: You can have as many time ranges as needed in a single schedule. This is useful for complex daily patterns.

## Installation

Install the required dependency:
```bash
npm install node-cron
```

The scheduler starts automatically 5 seconds after the server starts to ensure the WebSocket connection is established.

## Troubleshooting

**Schedule not executing:**
- Check that the schedule is enabled
- Verify the days and time ranges are correct
- Ensure the WebSocket connection is active
- Check server logs for error messages

**Wrong cameras affected:**
- Verify camera serial numbers in the schedule
- Check that cameras exist in the system
- Empty cameras array means ALL cameras

**Mode not changing:**
- Verify the mode value (0 or 2)
- Check WebSocket connection status
- Review camera_transitions.csv for execution logs
