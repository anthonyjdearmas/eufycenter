class MotionSensorManager {
    constructor(apiService) {
        this.apiService = apiService;
        this.lastMotionTimes = {};
        this.timeUpdateInterval = null;
        this.motionEventSource = null;
    }

    async loadMotionSensors() {
        try {
            const data = await this.apiService.getMotionSensors();
            this.updateMotionSensorDisplay(data.motionSensors);
        } catch (error) {
            this.updateMotionSensorDisplay(null, error.message);
        }
    }

    updateMotionSensorDisplay(sensors, error = null) {
        const container = document.getElementById('motionSensorList');
        
        if (error) {
            container.innerHTML = `
                <div class="text-center text-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>Failed to load motion sensors
                    <br><small>${error}</small>
                </div>
            `;
            return;
        }
        
        if (!sensors || sensors.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted">
                    <i class="bi bi-info-circle me-2"></i>No motion sensors found
                </div>
            `;
            return;
        }

        const activeSensors = sensors.filter(sensor => 
            sensor.properties && !sensor.error
        );

        if (activeSensors.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted">
                    <i class="bi bi-info-circle me-2"></i>No active motion sensors
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        
        activeSensors.forEach(sensor => {
            const sensorItem = document.createElement('div');
            sensorItem.className = 'motion-sensor-item d-flex justify-content-between align-items-center mb-2 p-2 bg-secondary bg-opacity-50 rounded';
            sensorItem.setAttribute('data-sensor-serial', sensor.serialNumber);
            
            const batteryLow = sensor.properties?.batteryLow || false;
            const batteryIcon = batteryLow ? 'bi-battery-half text-warning' : 'bi-battery-full text-success';
            const batteryText = batteryLow ? 'Low' : 'OK';
            
            const sensorName = sensor.properties?.name || sensor.name;
            
            const lastMotionTime = sensor.properties?.motionSensorPirEvent;
            if (lastMotionTime) {
                this.lastMotionTimes[sensor.serialNumber] = lastMotionTime;
            }
            const lastMotionDisplay = this.formatRelativeTime(lastMotionTime);
            
            sensorItem.innerHTML = `
                <div class="d-flex flex-column">
                    <div class="d-flex align-items-center mb-1">
                        <i class="bi bi-broadcast text-success me-2"></i>
                        <strong>${sensorName}</strong>
                    </div>
                    <small class="text-muted ms-4" style="font-size: 0.75rem;" data-last-motion="${sensor.serialNumber}">
                        <i class="bi bi-clock me-1"></i>Last: ${lastMotionDisplay}
                    </small>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-success">Active</span>
                    <span><i class="bi ${batteryIcon} me-1"></i><small>${batteryText}</small></span>
                </div>
            `;
            
            container.appendChild(sensorItem);
        });
    }

    formatRelativeTime(timestamp) {
        if (!timestamp) return 'Never';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else {
            return `${diffDays}d ago`;
        }
    }

    startTimeUpdateInterval() {
        this.timeUpdateInterval = setInterval(() => {
            this.updateAllMotionTimes();
        }, 30000);
    }

    updateAllMotionTimes() {
        for (const [serialNumber, timestamp] of Object.entries(this.lastMotionTimes)) {
            this.updateMotionSensorLastTime(serialNumber);
        }
    }

    updateMotionSensorLastTime(serialNumber) {
        const element = document.querySelector(`[data-last-motion="${serialNumber}"]`);
        if (element && this.lastMotionTimes[serialNumber]) {
            const relativeTime = this.formatRelativeTime(this.lastMotionTimes[serialNumber]);
            element.innerHTML = `<i class="bi bi-clock me-1"></i>Last: ${relativeTime}`;
        }
    }

    connectToMotionEvents(onMotionEvent) {
        if (this.motionEventSource) {
            this.motionEventSource.close();
        }
        
        try {
            this.motionEventSource = this.apiService.connectToMotionEvents();
            
            this.motionEventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.status === 'connected') {
                        console.log('Connected to motion event stream');
                        return;
                    }
                    
                    if (data.motionDetected !== undefined) {
                        this.handleRealtimeMotionEvent(data, onMotionEvent);
                    }
                } catch (error) {
                    console.error('Error parsing motion event:', error);
                }
            };
            
            this.motionEventSource.onerror = (error) => {
                if (this.motionEventSource.readyState === EventSource.CONNECTING) {
                    console.log('Motion event stream reconnecting...');
                } else if (this.motionEventSource.readyState === EventSource.CLOSED) {
                    console.log('Motion event stream closed, will reconnect in 5 seconds...');
                    setTimeout(() => {
                        if (!this.motionEventSource || this.motionEventSource.readyState === EventSource.CLOSED) {
                            console.log('Reconnecting to motion event stream...');
                            this.connectToMotionEvents(onMotionEvent);
                        }
                    }, 5000);
                }
            };
        } catch (error) {
            console.error('Failed to connect to motion event stream:', error);
        }
    }

    handleRealtimeMotionEvent(data, onMotionEvent) {
        const { serialNumber, deviceName, motionDetected, timestamp } = data;
        
        if (motionDetected) {
            console.log(`🚨 Real-time motion detected: ${deviceName} at ${timestamp}`);
            
            const timestampMs = new Date(timestamp).getTime();
            this.lastMotionTimes[serialNumber] = timestampMs;
            
            this.updateMotionSensorLastTime(serialNumber);
            
            const sensorItem = document.querySelector(`[data-sensor-serial="${serialNumber}"]`);
            if (sensorItem) {
                sensorItem.classList.add('motion-active');
                setTimeout(() => {
                    sensorItem.classList.remove('motion-active');
                }, 3000);
            }
            
            if (onMotionEvent) {
                onMotionEvent();
            }
        }
    }

    cleanup() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        if (this.motionEventSource) {
            this.motionEventSource.close();
        }
    }
}
