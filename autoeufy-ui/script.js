// Minimal JavaScript for the Bootstrap project

document.addEventListener('DOMContentLoaded', function() {
    const mainButton = document.getElementById('mainButton');
    
    mainButton.addEventListener('click', function() {
        // Simple click handler - could be expanded later
        console.log('Button clicked!');
        
        // Optional: Show a simple alert or change button text
        this.textContent = this.textContent === 'Click Me!' ? 'Clicked!' : 'Click Me!';
        
        // Reset button text after 1 second
        setTimeout(() => {
            this.textContent = 'Click Me!';
        }, 1000);
    });
});

// Camera Mode Toggle Application

class CameraModeToggle {
    constructor() {
        this.apiBase = 'http://localhost:8080';
        this.toggleButton = document.getElementById('cameraToggle');
        this.toggleStatus = document.getElementById('toggleStatus');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.cameraDetails = document.getElementById('cameraDetails');
        
        this.isToggling = false;
        this.currentMode = null;
        
        this.init();
    }

    init() {
        // Add event listeners
        this.toggleButton.addEventListener('click', () => this.handleToggle());
        
        // Check initial status
        this.checkConnection();
        
        // Auto-refresh status every 30 seconds
        setInterval(() => this.checkConnection(), 30000);
    }

    async checkConnection() {
        console.log('Checking connection and fetching device status...');
        try {
            const response = await fetch(`${this.apiBase}/api/devices`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Received device data:', data);
            this.updateConnectionStatus(true);
            this.updateCameraStatus(data.devices);
            
        } catch (error) {
            console.error('Connection check failed:', error);
            this.updateConnectionStatus(false, error.message);
        }
    }

    updateConnectionStatus(connected, error = null) {
        const icon = this.connectionStatus.querySelector('i');
        const text = this.connectionStatus.querySelector('span');
        
        if (connected) {
            icon.className = 'bi bi-circle-fill text-success';
            text.textContent = 'Connected to Eufy System';
            this.toggleButton.disabled = false;
        } else {
            icon.className = 'bi bi-circle-fill text-danger';
            text.textContent = error ? `Connection Error: ${error}` : 'Connection Failed';
            this.toggleButton.disabled = true;
            this.toggleStatus.textContent = 'Connection Required';
        }
    }

    updateCameraStatus(devices) {
        console.log('Updating camera status with devices:', devices);
        const cameras = devices.filter(device => device.type === 'device');
        
        if (cameras.length === 0) {
            this.toggleStatus.textContent = 'No cameras found';
            return;
        }

        // Analyze current state
        let batteryModeCount = 0;
        let customizedModeCount = 0;
        let allOtherMotionsEnabled = 0;
        let allOtherMotionsDisabled = 0;

        cameras.forEach(camera => {
            if (camera.properties) {
                // Count power modes (1 = battery, 2 = customized)
                if (camera.properties.motionDetection === true) {
                    // Only count cameras with motion detection enabled
                    const powerMode = camera.properties.motionDetectionTypeAllOtherMotions;
                    console.log(`${camera.name}: All Other Motions = ${powerMode}`);
                    if (powerMode === true) allOtherMotionsEnabled++;
                    if (powerMode === false) allOtherMotionsDisabled++;
                }
            }
        });

        console.log(`Status analysis: ${allOtherMotionsEnabled} enabled, ${allOtherMotionsDisabled} disabled out of ${cameras.length} cameras`);

        // Determine current overall state
        let statusText = '';
        let isInBatteryMode = false;

        if (allOtherMotionsDisabled >= cameras.length / 2) {
            statusText = 'Battery Life Mode';
            isInBatteryMode = true;
        } else if (allOtherMotionsEnabled >= cameras.length / 2) {
            statusText = 'Full Recording Mode';
            isInBatteryMode = false;
        } else {
            statusText = 'Mixed Mode';
            isInBatteryMode = false;
        }

        console.log(`Setting status to: ${statusText}, Battery Mode: ${isInBatteryMode}`);
        this.toggleStatus.textContent = statusText;
        this.updateToggleAppearance(isInBatteryMode);
        this.updateCameraDetails(cameras);
    }

    updateToggleAppearance(isBatteryMode) {
        const switchThumb = this.toggleButton.querySelector('.switch-thumb');
        const toggleBtn = this.toggleButton;
        
        console.log(`Updating toggle appearance: Battery Mode = ${isBatteryMode}`);
        console.log(`Before: classes = ${toggleBtn.className}`);
        
        if (isBatteryMode) {
            toggleBtn.classList.remove('active');
            toggleBtn.classList.add('battery-mode');
        } else {
            toggleBtn.classList.add('active');
            toggleBtn.classList.remove('battery-mode');
        }
        
        console.log(`After: classes = ${toggleBtn.className}`);
    }

    updateCameraDetails(cameras) {
        const container = this.cameraDetails;
        container.innerHTML = '';

        cameras.forEach(camera => {
            const row = document.createElement('div');
            row.className = 'row mb-2 align-items-center';
            
            const getPowerModeName = (allOtherMotions) => {
                if (allOtherMotions === true) return 'Full Recording';
                if (allOtherMotions === false) return 'Battery Life';
                return 'Unknown';
            };

            const batteryLevel = camera.properties?.battery || 'N/A';
            const powerMode = camera.properties?.motionDetectionTypeAllOtherMotions;
            const enabled = camera.properties?.enabled;

            row.innerHTML = `
                <div class="col-6 col-md-4">
                    <strong>${camera.name}</strong>
                </div>
                <div class="col-6 col-md-3">
                    <span class="badge bg-${powerMode === false ? 'warning' : 'success'} small">
                        ${getPowerModeName(powerMode)}
                    </span>
                </div>
                <div class="col-6 col-md-3">
                    <i class="bi bi-battery"></i> ${batteryLevel}%
                </div>
                <div class="col-6 col-md-2">
                    <i class="bi bi-${enabled ? 'check-circle text-success' : 'x-circle text-danger'}"></i>
                </div>
            `;
            
            container.appendChild(row);
        });
    }

    async handleToggle() {
        if (this.isToggling) return;
        
        this.isToggling = true;
        this.showLoading(true);
        
        try {
            const response = await fetch(`${this.apiBase}/api/cameras/toggle-mode`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Toggle operation completed:', result);
            
            // Refresh camera status after toggle - multiple attempts to ensure update
            console.log('Toggle completed, refreshing status...');
            
            // Immediate refresh
            setTimeout(() => {
                console.log('First refresh attempt...');
                this.checkConnection();
            }, 500);
            
            // Second refresh to ensure we catch any delayed updates
            setTimeout(() => {
                console.log('Second refresh attempt...');
                this.checkConnection();
            }, 2000);
            
            // Third refresh for good measure
            setTimeout(() => {
                console.log('Final refresh attempt...');
                this.checkConnection();
            }, 4000);
            
        } catch (error) {
            console.error('Toggle failed:', error);
            // Could add a toast notification here instead of a panel
        } finally {
            this.isToggling = false;
            this.showLoading(false);
        }
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.remove('d-none');
            this.toggleButton.disabled = true;
        } else {
            this.loadingOverlay.classList.add('d-none');
            this.toggleButton.disabled = false;
        }
    }


}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CameraModeToggle();
}); 