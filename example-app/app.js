import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 8080;

let ws = null;

// Start the Eufy security server
const eufyServer = spawn('node', [
    'node_modules/eufy-security-ws/dist/bin/server.js',
    '-c', join(__dirname, 'config.json'),
    '-v',
    '-H', 'localhost',
    '-p', '3000'
]);

eufyServer.stdout.on('data', (data) => {
    console.log(`Eufy Server: ${data}`);
    
    // Check if server is listening and create WebSocket connection
    if (data.toString().includes('Eufy Security server listening') && !ws) {
        // Create a WebSocket client to connect to the Eufy server
        ws = new WebSocket('ws://localhost:3000');

        ws.on('open', () => {
            console.log('Connected to Eufy Security Server');
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            console.log('Received message:', message);
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        ws.on('close', () => {
            console.log('WebSocket connection closed');
            ws = null;
        });
    }
});

eufyServer.stderr.on('data', (data) => {
    console.error(`Eufy Server Error: ${data}`);
});

// Express routes
app.get('/', (req, res) => {
    res.send('Eufy Security Example App');
});

// API endpoint to get all devices
app.get('/api/devices', (req, res) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = {
            messageId: Date.now().toString(),
            command: 'driver.is_connected'
        };
        ws.send(JSON.stringify(message));
        res.send({ status: 'Request sent to check connection' });
    } else {
        res.status(503).send({ error: 'WebSocket not connected' });
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
}); 