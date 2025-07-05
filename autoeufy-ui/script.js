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
        
        // Settings-related properties
        this.settings = this.loadSettings();
        this.refreshInterval = null;
        this.lastDevicesData = null;
        
        this.init();
    }

    init() {
        // Add event listeners
        this.toggleButton.addEventListener('click', () => this.handleToggle());
        
        // Initialize settings
        this.initializeSettings();
        
        // Check initial status
        this.checkConnection();
        
        // Set up auto-refresh with current settings
        this.setupAutoRefresh();
    }
    
    // Settings Management
    loadSettings() {
        const defaultSettings = {
            apiEndpoint: 'http://localhost:8080',
            refreshInterval: 30,
            showBatteryLevels: true,
            autoExpandDetails: false,
            soundEffects: false,
            confirmActions: true,
            defaultMode: 'recording',
            toggleDelay: 2
        };
        
        try {
            const saved = localStorage.getItem('eufySettings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch (error) {
            console.warn('Failed to load settings:', error);
            return defaultSettings;
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('eufySettings', JSON.stringify(this.settings));
            console.log('Settings saved successfully');
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
    
    initializeSettings() {
        // Populate settings modal with current values
        document.getElementById('apiEndpoint').value = this.settings.apiEndpoint;
        document.getElementById('refreshInterval').value = this.settings.refreshInterval;
        document.getElementById('showBatteryLevels').checked = this.settings.showBatteryLevels;
        document.getElementById('autoExpandDetails').checked = this.settings.autoExpandDetails;
        document.getElementById('soundEffects').checked = this.settings.soundEffects;
        document.getElementById('confirmActions').checked = this.settings.confirmActions;
        document.getElementById('defaultMode').value = this.settings.defaultMode;
        document.getElementById('toggleDelay').value = this.settings.toggleDelay;
        
        // Add save settings event listener
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.applySettings();
        });
        
        // Auto-expand details if setting is enabled
        if (this.settings.autoExpandDetails) {
            setTimeout(() => {
                const toggleButton = document.getElementById('toggleCameraList');
                const collapse = new bootstrap.Collapse(document.getElementById('cameraList'));
                collapse.show();
            }, 1000);
        }
        
        // Apply current API endpoint
        this.apiBase = this.settings.apiEndpoint;
    }
    
    applySettings() {
        // Get values from modal
        const newSettings = {
            apiEndpoint: document.getElementById('apiEndpoint').value,
            refreshInterval: parseInt(document.getElementById('refreshInterval').value),
            showBatteryLevels: document.getElementById('showBatteryLevels').checked,
            autoExpandDetails: document.getElementById('autoExpandDetails').checked,
            soundEffects: document.getElementById('soundEffects').checked,
            confirmActions: document.getElementById('confirmActions').checked,
            defaultMode: document.getElementById('defaultMode').value,
            toggleDelay: parseInt(document.getElementById('toggleDelay').value)
        };
        
        // Check if API endpoint changed
        const apiChanged = this.settings.apiEndpoint !== newSettings.apiEndpoint;
        const intervalChanged = this.settings.refreshInterval !== newSettings.refreshInterval;
        
        // Update settings
        this.settings = newSettings;
        this.saveSettings();
        
        // Apply changes
        if (apiChanged) {
            this.apiBase = this.settings.apiEndpoint;
            // Recheck connection with new endpoint
            this.checkConnection();
        }
        
        if (intervalChanged) {
            this.setupAutoRefresh();
        }
        
        // Refresh camera details to apply display settings immediately
        this.refreshCameraDetailsDisplay();
        
        // Handle auto-expand details setting
        const cameraList = document.getElementById('cameraList');
        if (this.settings.autoExpandDetails) {
            if (!cameraList.classList.contains('show')) {
                const collapse = new bootstrap.Collapse(cameraList);
                collapse.show();
            }
        } else {
            // If auto-expand is disabled and details are currently shown, leave them as-is
            // (don't auto-collapse, let user control it manually)
        }
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
        modal.hide();
        
        // Show success message
        this.showNotification('Settings saved successfully!', 'success');
    }
    
    setupAutoRefresh() {
        // Clear existing interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Set up new interval
        this.refreshInterval = setInterval(() => {
            this.checkConnection();
        }, this.settings.refreshInterval * 1000);
    }
    
    refreshCameraDetailsDisplay() {
        // Re-render camera details with current settings
        if (this.lastDevicesData) {
            const cameras = this.lastDevicesData.filter(device => device.type === 'device');
            this.updateCameraDetails(cameras);
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
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
        // Store devices data for later use
        this.lastDevicesData = devices;
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

            // Only show battery level if setting is enabled
            const batteryCol = this.settings.showBatteryLevels ? `
                <div class="col-6 col-md-3">
                    <i class="bi bi-battery"></i> ${batteryLevel}%
                </div>
            ` : '';

            row.innerHTML = `
                <div class="col-6 col-md-4">
                    <strong>${camera.name}</strong>
                </div>
                <div class="col-6 col-md-3">
                    <span class="badge bg-${powerMode === false ? 'warning' : 'success'} small">
                        ${getPowerModeName(powerMode)}
                    </span>
                </div>
                ${batteryCol}
                <div class="col-6 col-md-2">
                    <i class="bi bi-${enabled ? 'check-circle text-success' : 'x-circle text-danger'}"></i>
                </div>
            `;
            
            container.appendChild(row);
        });
    }

    async handleToggle() {
        if (this.isToggling) return;
        
        // Show confirmation if enabled
        if (this.settings.confirmActions) {
            if (!confirm('Are you sure you want to toggle the camera mode for all cameras?')) {
                return;
            }
        }
        
        this.isToggling = true;
        this.showLoading(true);
        
        // Apply toggle delay if set
        if (this.settings.toggleDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.settings.toggleDelay * 1000));
        }
        
        try {
            const response = await fetch(`${this.apiBase}/api/cameras/toggle-mode`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Toggle result:', result);
            
            // Play sound effect if enabled
            if (this.settings.soundEffects) {
                this.playToggleSound();
            }
            
            // Show success notification
            this.showNotification(`Successfully toggled ${result.summary.successfulCameras} cameras`, 'success');
            
            // Refresh status after toggle
            setTimeout(() => {
                this.checkConnection();
            }, 1000);
            
        } catch (error) {
            console.error('Toggle failed:', error);
            this.showNotification(`Toggle failed: ${error.message}`, 'danger');
        } finally {
            this.isToggling = false;
            this.showLoading(false);
        }
    }
    
    playToggleSound() {
        try {
            // Create a simple beep sound using Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            console.warn('Could not play sound effect:', error);
        }
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.remove('d-none');
        } else {
            this.loadingOverlay.classList.add('d-none');
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', function() {
    new CameraModeToggle();
}); 