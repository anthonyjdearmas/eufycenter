// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const { EufySecurity } = require('eufy-security-client');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON bodies
app.use(express.json());

// Initialize Eufy Security client
let eufyClient = null;
let clientInitializing = false;
let clientInitialized = false;

// Eufy Security credentials
const eufyConfig = {
  username: process.env.EUFY_USERNAME,
  password: process.env.EUFY_PASSWORD,
  country: process.env.EUFY_COUNTRY || 'US',
  trustedDeviceName: 'EUFY Simple Center',
  persistentDir: './persistent',
  // Set polling to false to avoid unnecessary requests
  pollingIntervalMinutes: 0,
  // Set to false to avoid automatic cloud connection
  autoConnectDevices: false
};

// Helper function to create a timeout promise
const createTimeout = (ms, message) => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};

async function initializeEufyClient() {
  // If client is already initialized, return it
  if (clientInitialized && eufyClient) {
    return eufyClient;
  }
  
  // If client is currently initializing, wait for it to complete
  if (clientInitializing) {
    console.log('Client is already initializing, waiting...');
    // Wait until initialization is complete
    while (clientInitializing) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return eufyClient;
  }
  
  try {
    clientInitializing = true;
    console.log('Initializing Eufy Security client with credentials:', { 
      username: eufyConfig.username, 
      country: eufyConfig.country 
    });
    
    // Initialize the EufySecurity client using the static initialize method
    console.log('Initializing EufySecurity client...');
    
    // Create a timeout promise for initialization
    const initializeWithTimeout = Promise.race([
      EufySecurity.initialize({
        username: eufyConfig.username,
        password: eufyConfig.password,
        country: eufyConfig.country,
        trustedDeviceName: eufyConfig.trustedDeviceName,
        persistentDir: './persistent',
        p2pConnectionSetup: 'QUICKEST',
        pollingIntervalMinutes: eufyConfig.pollingIntervalMinutes,
        acceptInvitations: false
      }),
      createTimeout(30000, 'Eufy client initialization timed out after 30 seconds')
    ]);
    
    // Wait for initialization to complete
    eufyClient = await initializeWithTimeout;
    
    console.log('Successfully initialized Eufy Security client');
    clientInitialized = true;
    
    return eufyClient;
  } catch (error) {
    console.error('Failed to initialize Eufy Security client:', error);
    clientInitialized = false;
    eufyClient = null;
    throw error;
  } finally {
    clientInitializing = false;
  }
}

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the EUFY Simple Center API' });
});

// Endpoint to enable motion detection
app.post('/api/cameras/:deviceSN/motion-detection/enable', async (req, res) => {
  try {
    const { deviceSN } = req.params;
    console.log(`Enabling motion detection for device ${deviceSN}...`);
    
    // Initialize the client if not already initialized
    const client = await initializeEufyClient();
    
    // Get the device
    console.log(`Getting device ${deviceSN}...`);
    const device = await client.getDevice(deviceSN);
    
    if (!device) {
      console.log(`Device ${deviceSN} not found`);
      return res.status(404).json({ error: 'Device not found' });
    }
    
    console.log(`Found device: ${device.getName()}`);
    
    // Get the station that the device belongs to
    const stationSN = device.getStationSerial();
    console.log(`Getting station ${stationSN}...`);
    const station = await client.getStation(stationSN);
    
    if (!station) {
      console.log(`Station ${stationSN} not found`);
      return res.status(404).json({ error: 'Station not found' });
    }
    
    console.log(`Found station: ${station.getName()}`);
    
    // Check if the device supports motion detection
    if (!device.hasProperty('device_motion_detection')) {
      console.log(`Device ${device.getName()} does not support motion detection`);
      return res.status(400).json({ error: 'Device does not support motion detection' });
    }
    
    // Connect to the station if not already connected
    console.log(`Checking connection to station ${station.getSerial()}...`);
    if (!await client.isStationConnected(station.getSerial())) {
      console.log(`Connecting to station ${station.getSerial()}...`);
      await client.connectToStation(station.getSerial());
      console.log(`Connected to station ${station.getSerial()}`);
    } else {
      console.log(`Already connected to station ${station.getSerial()}`);
    }
    
    // Enable motion detection using the PropertyName enum
    console.log(`Enabling motion detection for ${device.getName()}...`);
    await client.setDeviceProperty(device, 'device_motion_detection', true);
    console.log(`Motion detection enabled for ${device.getName()}`);
    
    res.json({ success: true, message: 'Motion detection enabled successfully' });
  } catch (error) {
    console.error('Error enabling motion detection:', error);
    res.status(500).json({ 
      error: 'Failed to enable motion detection', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Endpoint to disable motion detection
app.post('/api/cameras/:deviceSN/motion-detection/disable', async (req, res) => {
  try {
    const { deviceSN } = req.params;
    console.log(`Disabling motion detection for device ${deviceSN}...`);
    
    // Initialize the client if not already initialized
    const client = await initializeEufyClient();
    
    // Get the device
    console.log(`Getting device ${deviceSN}...`);
    const device = await client.getDevice(deviceSN);
    
    if (!device) {
      console.log(`Device ${deviceSN} not found`);
      return res.status(404).json({ error: 'Device not found' });
    }
    
    console.log(`Found device: ${device.getName()}`);
    
    // Get the station that the device belongs to
    const stationSN = device.getStationSerial();
    console.log(`Getting station ${stationSN}...`);
    const station = await client.getStation(stationSN);
    
    if (!station) {
      console.log(`Station ${stationSN} not found`);
      return res.status(404).json({ error: 'Station not found' });
    }
    
    console.log(`Found station: ${station.getName()}`);
    
    // Check if the device supports motion detection
    if (!device.hasProperty('device_motion_detection')) {
      console.log(`Device ${device.getName()} does not support motion detection`);
      return res.status(400).json({ error: 'Device does not support motion detection' });
    }
    
    // Connect to the station if not already connected
    console.log(`Checking connection to station ${station.getSerial()}...`);
    if (!await client.isStationConnected(station.getSerial())) {
      console.log(`Connecting to station ${station.getSerial()}...`);
      await client.connectToStation(station.getSerial());
      console.log(`Connected to station ${station.getSerial()}`);
    } else {
      console.log(`Already connected to station ${station.getSerial()}`);
    }
    
    // Disable motion detection
    console.log(`Disabling motion detection for ${device.getName()}...`);
    await client.setDeviceProperty(device, 'device_motion_detection', false);
    console.log(`Motion detection disabled for ${device.getName()}`);
    
    res.json({ success: true, message: 'Motion detection disabled successfully' });
  } catch (error) {
    console.error('Error disabling motion detection:', error);
    res.status(500).json({ 
      error: 'Failed to disable motion detection', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Endpoint to get the list of cameras
app.get('/api/cameras', async (req, res) => {
  try {
    // Initialize the client if not already initialized
    console.log('Attempting to initialize Eufy client...');
    const client = await initializeEufyClient();
    console.log('Eufy client initialized, getting devices...');
    
    // Get all devices with a timeout of 30 seconds
    console.log('Fetching devices with timeout...');
    const devices = await Promise.race([
      client.getDevices(),
      createTimeout(30000, 'Getting devices timed out after 30 seconds')
    ]);
    
    console.log(`Found ${devices.length} devices`);
    
    // Filter cameras only
    const cameras = devices.filter(device => {
      try {
        const deviceType = device.getDeviceType();
        const isCamera = deviceType.includes('CAMERA') || deviceType.includes('DOORBELL');
        console.log(`Device ${device.getName()} (${device.getSerial()}) is ${isCamera ? '' : 'not '}a camera`);
        return isCamera;
      } catch (err) {
        console.error(`Error processing device:`, err);
        return false;
      }
    }).map(camera => {
      try {
        const hasMotionDetection = camera.hasProperty('device_motion_detection');
        console.log(`Camera ${camera.getName()} ${hasMotionDetection ? 'supports' : 'does not support'} motion detection`);
        
        return {
          serialNumber: camera.getSerial(),
          name: camera.getName(),
          type: camera.getDeviceType(),
          motionDetectionEnabled: hasMotionDetection ? camera.getPropertyValue('device_motion_detection') : null,
          stationSerial: camera.getStationSerial()
        };
      } catch (err) {
        console.error(`Error processing camera ${camera.getSerial()}:`, err);
        return {
          serialNumber: camera.getSerial(),
          name: 'Error retrieving camera info',
          error: err.message
        };
      }
    });
    
    console.log(`Returning ${cameras.length} cameras`);
    res.json({ cameras });
  } catch (error) {
    console.error('Error getting cameras:', error);
    res.status(500).json({ 
      error: 'Failed to get cameras', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
