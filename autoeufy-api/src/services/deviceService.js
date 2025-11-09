export function getAllDevices() {
    const knownDevices = [
        {
            serialNumber: 'T8113N63212153EF',
            type: 'device',
            name: 'Backyard',
            deviceType: 8,
            category: 'camera'
        },
        {
            serialNumber: 'T8113N63212153E0',
            type: 'device',
            name: 'Shed',
            deviceType: 8,
            category: 'camera'
        },
        {
            serialNumber: 'T8170T102427108A',
            type: 'device',
            name: 'Driveway',
            deviceType: 48,
            category: 'camera'
        },
        {
            serialNumber: 'T8170T1024353ED4',
            type: 'device',
            name: 'Driveway Above View',
            deviceType: 48,
            category: 'camera'
        },
        {
            serialNumber: 'T8030P1324262B52',
            type: 'station',
            name: 'Base Station',
            deviceType: 'station',
            category: 'station'
        },
        {
            serialNumber: 'T8910P0025170762',
            type: 'device',
            name: 'Side door Sensor',
            deviceType: 'T8910',
            category: 'motion_sensor'
        }
    ];

    return Promise.resolve(knownDevices);
}

export function refreshDevices(ws, isConnected) {
    if (!ws || !isConnected) return;

    const message = {
        messageId: 'poll_refresh_' + Date.now(),
        command: 'driver.poll_refresh'
    };
    ws.send(JSON.stringify(message));
}
