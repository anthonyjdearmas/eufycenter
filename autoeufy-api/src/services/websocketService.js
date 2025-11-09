import { spawn } from 'child_process';
import WebSocket from 'ws';
import { setWs, setIsConnected, setDevices } from '../config/state.js';
import { EUFY_WS_HOST, EUFY_WS_PORT, CONFIG_FILE_PATH } from '../config/constants.js';
import { refreshDevices } from './deviceService.js';

export function startEufyServer() {
    const eufyServer = spawn('node', [
        'node_modules/eufy-security-ws/dist/bin/server.js',
        '-c', CONFIG_FILE_PATH,
        '-v',
        '-H', EUFY_WS_HOST,
        '-p', String(EUFY_WS_PORT)
    ]);

    eufyServer.stdout.on('data', (data) => {
        console.log(`Eufy Server: ${data}`);

        if (data.toString().includes('Eufy Security server listening')) {
            initializeWebSocketConnection();
        }
    });

    eufyServer.stderr.on('data', (data) => {
        console.error(`Eufy Server Error: ${data}`);
    });

    return eufyServer;
}

function initializeWebSocketConnection() {
    const ws = new WebSocket(`ws://${EUFY_WS_HOST}:${EUFY_WS_PORT}`);

    ws.on('open', () => {
        console.log('Connected to Eufy Security Server');
        const connectMessage = {
            messageId: 'connect_' + Date.now(),
            command: 'driver.connect'
        };
        ws.send(JSON.stringify(connectMessage));
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('Received message:', message);

        if (message.type === 'result' && message.messageId.startsWith('connect_')) {
            if (message.success) {
                setIsConnected(true);
                console.log('Successfully connected to Eufy service');
                refreshDevices(ws, true);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        setWs(null);
        setIsConnected(false);
        setDevices([]);
    });

    setWs(ws);
}
