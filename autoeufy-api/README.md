# Eufy Security Example App

This is a simple Express.js application that demonstrates how to use the eufy-security-ws library.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your Eufy credentials:
   - Open `config.json`
   - Replace `YOUR_EUFY_EMAIL` with your Eufy account email
   - Replace `YOUR_EUFY_PASSWORD` with your Eufy account password

## Running the App

Start the application:
```bash
npm start
```

This will:
1. Start the Eufy security server on port 3000
2. Start the Express application on port 8080

## Available Endpoints

### Basic Endpoints
- `GET /`: Shows a welcome message
- `GET /health`: Health check endpoint
- `GET /api/devices`: Checks the connection status with the Eufy server

### Camera Control
- `POST /api/cameras/toggle-mode`: Toggle camera modes between Optimal Surveillance and Customized Recording

### Scheduling
- `GET /api/schedules`: Get all schedules
- `POST /api/schedules`: Create a new schedule
- `GET /api/schedules/:id`: Get a specific schedule
- `PUT /api/schedules/:id`: Update a schedule
- `DELETE /api/schedules/:id`: Delete a schedule
- `PATCH /api/schedules/:id/toggle`: Enable/disable a schedule
- `GET /api/schedules/info/example`: Get example schedule format

For detailed scheduling documentation, see [SCHEDULING_GUIDE.md](SCHEDULING_GUIDE.md)

## WebSocket Messages

The application connects to the Eufy security server via WebSocket and logs all received messages to the console. You can extend the functionality by adding more message handlers and API endpoints.

## Requirements

- Node.js >= 20.0.0
- A Eufy security account with devices set up 