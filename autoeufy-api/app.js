import express from 'express';
import { PORT } from './src/config/constants.js';
import { corsMiddleware } from './src/middleware/cors.js';
import { initializeDevicePowerModes, loadDevicePowerModesFromCSV } from './src/utils/devicePowerModes.js';
import { startEufyServer } from './src/services/websocketService.js';
import deviceRoutes from './src/routes/deviceRoutes.js';
import cameraRoutes from './src/routes/cameraRoutes.js';
import settingsRoutes from './src/routes/settingsRoutes.js';

const app = express();

initializeDevicePowerModes();
loadDevicePowerModesFromCSV();

startEufyServer();

app.use(corsMiddleware);
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Eufy Security Example App');
});

app.get('/health', (req, res) => {
    res.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connection: 'connected'
    });
});

app.use('/api', deviceRoutes);
app.use('/api', cameraRoutes);
app.use('/api', settingsRoutes);

app.listen(PORT, () => {
    console.log(`Example app listening at http://localhost:${PORT}`);
});
