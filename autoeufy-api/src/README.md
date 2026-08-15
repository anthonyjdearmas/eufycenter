# AutoEufy API - Code Structure

This directory contains the refactored modular code for the AutoEufy API.

## Directory Structure

```
src/
├── config/
│   ├── constants.js       # Application constants (ports, paths, etc.)
│   └── state.js          # Global application state management
│
├── middleware/
│   └── cors.js           # CORS middleware configuration
│
├── routes/
│   ├── cameraRoutes.js   # Camera control endpoints (/api/cameras/*)
│   ├── deviceRoutes.js   # Device listing endpoints (/api/devices, /api/motion-sensors)
│   └── settingsRoutes.js # Settings and logging endpoints (/api/settings, /api/transitions, etc.)
│
├── services/
│   ├── cameraService.js          # Camera switching and control logic
│   ├── deviceService.js          # Device listing and refresh logic
│   ├── motionDetectionService.js # Motion detection and auto-switching logic
│   └── websocketService.js       # Eufy WebSocket connection management
│
└── utils/
    ├── csvLogger.js          # CSV logging and settings persistence
    └── devicePowerModes.js   # Device power mode management
```

## Module Descriptions

### Config
- **constants.js**: Defines all application constants including ports, file paths, and configuration
- **state.js**: Manages global application state with getters and setters for WebSocket connection, devices, motion states, etc.

### Middleware
- **cors.js**: Handles CORS headers for cross-origin requests

### Routes
- **cameraRoutes.js**: Handles camera mode toggling endpoint
- **deviceRoutes.js**: Handles device listing and motion sensor endpoints
- **settingsRoutes.js**: Handles settings CRUD, transition logs, SSE motion events, and motion-triggered status

### Services
- **cameraService.js**: Business logic for switching cameras between modes and reverting
- **deviceService.js**: Device listing and refresh operations
- **motionDetectionService.js**: Motion sensor polling and auto-switching logic
- **websocketService.js**: Eufy server startup and WebSocket connection initialization

### Utils
- **csvLogger.js**: CSV file operations for logging transitions and persisting settings
- **devicePowerModes.js**: Device power mode tracking and management

## Main Entry Point

The main `app.js` file in the root directory imports and orchestrates all these modules:
1. Initializes device power modes
2. Starts the Eufy WebSocket server
3. Sets up Express middleware
4. Registers all route handlers
5. Starts the HTTP server

## Benefits of This Structure

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Maintainability**: Easier to locate and modify specific functionality
3. **Testability**: Individual modules can be tested in isolation
4. **Scalability**: New features can be added without modifying existing code
5. **Readability**: Smaller, focused files are easier to understand
