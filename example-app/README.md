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

- `GET /`: Shows a welcome message
- `GET /api/devices`: Checks the connection status with the Eufy server

## WebSocket Messages

The application connects to the Eufy security server via WebSocket and logs all received messages to the console. You can extend the functionality by adding more message handlers and API endpoints.

## Requirements

- Node.js >= 20.0.0
- A Eufy security account with devices set up 