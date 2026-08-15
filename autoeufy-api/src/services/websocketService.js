import { spawn } from 'child_process';
import WebSocket from 'ws';
import { setWs, setIsConnected, setDevices, setPendingCaptcha } from '../config/state.js';
import { EUFY_WS_HOST, EUFY_WS_PORT, CONFIG_FILE_PATH } from '../config/constants.js';
import { refreshDevices } from './deviceService.js';
import { startScheduler, stopScheduler } from './schedulerService.js';

export function startEufyServer() {
    const eufyServer = spawn('node', [
        'node_modules/eufy-security-ws/dist/bin/server.js',
        '-c', CONFIG_FILE_PATH,
        '-v',
        '-H', EUFY_WS_HOST,
        '-p', String(EUFY_WS_PORT)
    ]);

    eufyServer.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('T8410P5224413744')) return;
        console.log(`Eufy Server: ${data}`);

        if (output.includes('Eufy Security server listening')) {
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
        const setSchema = {
            messageId: 'set_schema_' + Date.now(),
            command: 'set_api_schema',
            schemaVersion: 21
        };
        ws.send(JSON.stringify(setSchema));
        const startListening = {
            messageId: 'start_listening_' + Date.now(),
            command: 'start_listening'
        };
        ws.send(JSON.stringify(startListening));
        const connectMessage = {
            messageId: 'connect_' + Date.now(),
            command: 'driver.connect'
        };
        ws.send(JSON.stringify(connectMessage));
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'event' && message.event && message.event.event === 'captcha request') {
            setPendingCaptcha({ captchaId: message.event.captchaId, captcha: message.event.captcha });
            console.log('CAPTCHA required! Visit http://localhost:8080/api/captcha to solve it.');
        }

        if (message.type === 'result' && message.messageId.startsWith('connect_')) {
            if (message.success) {
                setIsConnected(true);
                console.log('Successfully connected to Eufy service');
                refreshDevices(ws, true);
                
                console.log('Starting scheduler after successful WebSocket connection...');
                startScheduler();
            }
        }

        if (message.type === 'result' && message.messageId.startsWith('captcha_')) {
            if (message.success) {
                console.log('Captcha accepted, reconnecting...');
                setPendingCaptcha(null);
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
        
        // Stop scheduler when WebSocket disconnects
        console.log('Stopping scheduler due to WebSocket disconnection...');
        stopScheduler();
    });

    setWs(ws);
}
