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
        
        // Connection error handling
        this.isConnectionError = false;
        this.errorFlashInterval = null;
        this.errorSoundInterval = null;
        this.audioContext = null;
        
        this.init();
    }

    init() {
        // Add event listeners
        this.toggleButton.addEventListener('click', () => this.handleToggle());
        
        // Initialize settings
        this.initializeSettings();
        
        // Initialize audio context for connection error sounds
        this.initializeAudio();
        
        // Check initial status
        this.checkConnection();
        
        // Set up auto-refresh with current settings
        this.setupAutoRefresh();
        
        // Add cleanup when page unloads
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    // Cleanup method
    cleanup() {
        this.stopConnectionErrorAlerts();
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
    
    // Test connection error alerts (for testing purposes)
    testConnectionError() {
        if (this.isConnectionError) {
            // If already active, stop the alerts
            this.stopConnectionErrorAlerts();
            this.updateConnectionStatus(true); // Simulate connection restored
            this.showNotification('Connection error test stopped', 'info');
        } else {
            // Start the error alerts
            this.updateConnectionStatus(false, 'Failed to fetch (TEST MODE)');
            this.showNotification('Testing connection error alerts for 10 seconds...', 'warning');
            
            // Auto-stop after 10 seconds
            setTimeout(() => {
                if (this.isConnectionError) {
                    this.stopConnectionErrorAlerts();
                    this.updateConnectionStatus(true); // Simulate connection restored
                    this.showNotification('Connection error test completed', 'success');
                }
            }, 10000);
        }
    }
    
    // Initialize audio context for error sounds
    initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Audio context not supported:', error);
        }
    }
    
    // Play 3-tone beeping sound for connection errors
    playConnectionErrorSound() {
        if (!this.audioContext || this.settings.muteConnectionAlerts) return;
        
        // Resume audio context if it's suspended (required by browser policies)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        const tones = [800, 1000, 600]; // 3 different frequencies
        const toneDuration = 150; // milliseconds
        const pauseDuration = 100; // milliseconds between tones
        
        tones.forEach((frequency, index) => {
            setTimeout(() => {
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                oscillator.type = 'sine';
                
                // Set volume envelope
                gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.01);
                gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + toneDuration / 1000);
                
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + toneDuration / 1000);
            }, index * (toneDuration + pauseDuration));
        });
    }
    
    // Start connection error alerts
    startConnectionErrorAlerts() {
        if (this.isConnectionError) return; // Already active
        
        console.log('Starting connection error alerts');
        this.isConnectionError = true;
        
        // Add error class to body for CSS animations
        document.body.classList.add('connection-error');
        
        // Start flashing background
        this.errorFlashInterval = setInterval(() => {
            document.body.classList.toggle('error-flash');
        }, 1000); // Flash every 1 second (slow)
        
        // Play initial sound
        this.playConnectionErrorSound();
        
        // Set up recurring sound alerts (every 5 seconds)
        this.errorSoundInterval = setInterval(() => {
            this.playConnectionErrorSound();
        }, 5000);
    }
    
    // Stop connection error alerts
    stopConnectionErrorAlerts() {
        if (!this.isConnectionError) return; // Not active
        
        console.log('Stopping connection error alerts');
        this.isConnectionError = false;
        
        // Remove error classes
        document.body.classList.remove('connection-error', 'error-flash');
        
        // Clear intervals
        if (this.errorFlashInterval) {
            clearInterval(this.errorFlashInterval);
            this.errorFlashInterval = null;
        }
        
        if (this.errorSoundInterval) {
            clearInterval(this.errorSoundInterval);
            this.errorSoundInterval = null;
        }
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
            toggleDelay: 2,
            muteConnectionAlerts: false, // New setting for muting connection error sounds
            selectedCameras: [] // Array of camera serial numbers to include in toggle operations
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
        document.getElementById('muteConnectionAlerts').checked = this.settings.muteConnectionAlerts;
        
        // Add save settings event listener
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.applySettings();
        });
        
        // Add test connection error button listener
        document.getElementById('testConnectionError').addEventListener('click', () => {
            this.testConnectionError();
        });
        
        // Add camera selection button listeners
        document.getElementById('selectAllCameras').addEventListener('click', () => {
            this.selectAllCameras();
        });
        
        document.getElementById('selectNoneCameras').addEventListener('click', () => {
            this.selectNoneCameras();
        });
        
        // Load available cameras for selection
        this.loadCameraSelection();
        
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
            toggleDelay: parseInt(document.getElementById('toggleDelay').value),
            muteConnectionAlerts: document.getElementById('muteConnectionAlerts').checked,
            selectedCameras: this.getSelectedCameras()
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
    
    // Camera selection management functions
    async loadCameraSelection() {
        try {
            const response = await fetch(`${this.apiBase}/api/devices`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const cameras = data.devices.filter(device => device.type === 'device');
            
            this.populateCameraSelection(cameras);
        } catch (error) {
            console.error('Failed to load cameras for selection:', error);
            this.showCameraSelectionError('Failed to load cameras. Please check your connection.');
        }
    }
    
    populateCameraSelection(cameras) {
        const container = document.getElementById('cameraSelectionContainer');
        
        if (cameras.length === 0) {
            container.innerHTML = '<div class="col-12 text-center text-muted">No cameras found</div>';
            return;
        }
        
        // If no cameras were previously selected, default to all cameras
        if (this.settings.selectedCameras.length === 0) {
            this.settings.selectedCameras = cameras.map(camera => camera.serialNumber);
        }
        
        container.innerHTML = '';
        
        cameras.forEach(camera => {
            const isSelected = this.settings.selectedCameras.includes(camera.serialNumber);
            
            const checkboxCol = document.createElement('div');
            checkboxCol.className = 'col-md-6 mb-2';
            
            checkboxCol.innerHTML = `
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${camera.serialNumber}" 
                           id="camera_${camera.serialNumber}" ${isSelected ? 'checked' : ''}>
                    <label class="form-check-label" for="camera_${camera.serialNumber}">
                        <strong>${camera.name}</strong>
                        <br><small class="text-muted">${camera.serialNumber}</small>
                    </label>
                </div>
            `;
            
            container.appendChild(checkboxCol);
        });
    }
    
    showCameraSelectionError(message) {
        const container = document.getElementById('cameraSelectionContainer');
        container.innerHTML = `
            <div class="col-12 text-center text-danger">
                <i class="bi bi-exclamation-triangle me-2"></i>${message}
                <br><button type="button" class="btn btn-outline-light btn-sm mt-2" id="retryCameraSelection">
                    <i class="bi bi-arrow-clockwise me-1"></i>Retry
                </button>
            </div>
        `;
        
        // Add event listener for retry button
        const retryButton = document.getElementById('retryCameraSelection');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                this.loadCameraSelection();
            });
        }
    }
    
    selectAllCameras() {
        const checkboxes = document.querySelectorAll('#cameraSelectionContainer input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
    }
    
    selectNoneCameras() {
        const checkboxes = document.querySelectorAll('#cameraSelectionContainer input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    getSelectedCameras() {
        const checkboxes = document.querySelectorAll('#cameraSelectionContainer input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(checkbox => checkbox.value);
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
            
            // Stop connection error alerts if they were active
            this.stopConnectionErrorAlerts();
        } else {
            icon.className = 'bi bi-circle-fill text-danger';
            text.textContent = error ? `Connection Error: ${error}` : 'Connection Failed';
            this.toggleButton.disabled = true;
            this.toggleStatus.textContent = 'Connection Required';
            
            // Start connection error alerts if this is a "Failed to fetch" error
            if (error && error.toLowerCase().includes('failed to fetch')) {
                this.startConnectionErrorAlerts();
            }
        }
    }

    updateCameraStatus(devices) {
        // Store devices data for later use
        this.lastDevicesData = devices;
        let cameras = devices.filter(device => device.type === 'device');
        
        if (cameras.length === 0) {
            this.toggleStatus.textContent = 'No cameras found';
            return;
        }

        // Filter cameras to only include selected ones for toggle state determination
        let camerasForToggleState = cameras;
        if (this.settings.selectedCameras && this.settings.selectedCameras.length > 0) {
            camerasForToggleState = cameras.filter(camera => this.settings.selectedCameras.includes(camera.serialNumber));
            console.log(`Determining toggle state based on ${camerasForToggleState.length} selected cameras:`, 
                       camerasForToggleState.map(c => c.name));
        }

        if (camerasForToggleState.length === 0) {
            this.toggleStatus.textContent = 'No selected cameras found';
            return;
        }

        // Analyze current state using both power working mode and motion detection settings
        // Only consider selected cameras for toggle state determination
        let batteryModeCount = 0;
        let customizedModeCount = 0;
        let allOtherMotionsEnabled = 0;
        let allOtherMotionsDisabled = 0;

        camerasForToggleState.forEach(camera => {
            if (camera.properties && camera.properties.motionDetection === true) {
                // Count power working modes (0 = Optimal Surveillance/Battery, 2 = Customized Recording)
                const powerWorkingMode = Number(camera.properties.powerWorkingMode || 0);
                if (powerWorkingMode === 0) batteryModeCount++; // Mode 0 is battery saving
                if (powerWorkingMode === 2) customizedModeCount++;
                
                // Count motion detection settings
                const allOtherMotions = camera.properties.motionDetectionTypeAllOtherMotions;
                if (allOtherMotions === true) allOtherMotionsEnabled++;
                if (allOtherMotions === false) allOtherMotionsDisabled++;
            }
        });

        // Determine current overall state - prioritize power working mode for accuracy
        // Base the determination on selected cameras only
        let statusText = '';
        let isInBatteryMode = false;

        if (batteryModeCount >= camerasForToggleState.length / 2 && allOtherMotionsDisabled >= camerasForToggleState.length / 2) {
            statusText = 'Battery Saver Mode';
            isInBatteryMode = true;
        } else if (customizedModeCount >= camerasForToggleState.length / 2 && allOtherMotionsEnabled >= camerasForToggleState.length / 2) {
            statusText = 'Customized Recording Mode';
            isInBatteryMode = false;
        } else {
            statusText = 'Mixed Mode';
            isInBatteryMode = false;
        }

        // Add camera selection info to status text
        const selectedCount = this.settings.selectedCameras.length;
        const totalCameras = cameras.length;
        const selectionText = selectedCount > 0 && selectedCount < totalCameras 
            ? ` (${selectedCount}/${totalCameras} selected)`
            : '';

        this.toggleStatus.textContent = statusText + selectionText;
        this.updateToggleAppearance(isInBatteryMode);
        // Always show details for all cameras, but toggle state is based on selected cameras only
        this.updateCameraDetails(cameras);
    }

    updateToggleAppearance(isBatteryMode) {
        const toggleBtn = this.toggleButton;
        
        if (isBatteryMode) {
            toggleBtn.classList.remove('active');
            toggleBtn.classList.add('battery-mode');
        } else {
            toggleBtn.classList.add('active');
            toggleBtn.classList.remove('battery-mode');
        }
    }

    updateCameraDetails(cameras) {
        const container = this.cameraDetails;
        container.innerHTML = '';

        // Add header row
        const headerRow = document.createElement('div');
        headerRow.className = 'row mb-2 align-items-center border-bottom border-secondary pb-2';
        
        const batteryHeaderCol = this.settings.showBatteryLevels ? `
            <div class="col-6 col-md-2">
                <small class="text-white"><strong>Battery</strong></small>
            </div>
        ` : '';
        
        const nameHeaderColSize = this.settings.showBatteryLevels ? 'col-12 col-md-3' : 'col-6 col-md-4';
        const enabledHeaderColSize = this.settings.showBatteryLevels ? 'col-6 col-md-1' : 'col-6 col-md-2';

        headerRow.innerHTML = `
            <div class="${nameHeaderColSize}">
                <small class="text-white"><strong>Camera</strong></small>
            </div>
            <div class="col-6 col-md-2">
                <small class="text-white"><strong>Motion Mode</strong></small>
            </div>
            <div class="col-6 col-md-2">
                <small class="text-white"><strong>Power Mode</strong></small>
            </div>
            ${batteryHeaderCol}
            <div class="${enabledHeaderColSize} pe-0">
                <small class="text-white"><strong>Status</strong></small>
            </div>
        `;
        
        container.appendChild(headerRow);

        cameras.forEach(camera => {
            const row = document.createElement('div');
            row.className = 'row mb-2 align-items-center';
            
            const getPowerModeName = (allOtherMotions) => {
                if (allOtherMotions === true) return 'Full Recording';
                if (allOtherMotions === false) return 'Battery Life';
                return 'Unknown';
            };

            const getPowerWorkingModeName = (mode) => {
                // Convert to number to handle both string and numeric values
                const modeNum = Number(mode);
                switch(modeNum) {
                    case 0: return 'Battery Saver Mode';
                    case 1: return 'Optimal Battery';
                    case 2: return 'Customized Recording';
                    default: return mode !== undefined && mode !== null ? `Unknown (${mode})` : 'Unknown';
                }
            };

            const getPowerWorkingModeClass = (mode) => {
                // Convert to number to handle both string and numeric values
                const modeNum = Number(mode);
                switch(modeNum) {
                    case 0: return 'bg-info';
                    case 1: return 'bg-warning';
                    case 2: return 'bg-success';
                    default: return 'bg-secondary';
                }
            };

            const batteryLevel = camera.properties?.battery || 'N/A';
            const powerMode = camera.properties?.motionDetectionTypeAllOtherMotions;
            const powerWorkingMode = camera.properties?.powerWorkingMode;
            const enabled = camera.properties?.enabled;

            // Only show battery level if setting is enabled
            const batteryCol = this.settings.showBatteryLevels ? `
                <div class="col-6 col-md-2">
                    <i class="bi bi-battery"></i> ${batteryLevel}%
                </div>
            ` : '';

            // Adjust column sizes based on whether battery is shown
            const nameColSize = this.settings.showBatteryLevels ? 'col-12 col-md-3' : 'col-6 col-md-4';
            const statusColSize = this.settings.showBatteryLevels ? 'col-6 col-md-2' : 'col-6 col-md-3';
            const enabledColSize = this.settings.showBatteryLevels ? 'col-6 col-md-1' : 'col-6 col-md-2';

            // Check if this camera is selected for toggle operations
            const isSelected = !this.settings.selectedCameras || 
                             this.settings.selectedCameras.length === 0 || 
                             this.settings.selectedCameras.includes(camera.serialNumber);
            
            const selectedIndicator = this.settings.selectedCameras && this.settings.selectedCameras.length > 0 
                ? (isSelected ? '<i class="bi bi-check-circle-fill text-primary me-1" title="Selected for toggle"></i>' 
                             : '<i class="bi bi-circle text-muted me-1" title="Not selected for toggle"></i>')
                : '';

            row.innerHTML = `
                <div class="${nameColSize}">
                    ${selectedIndicator}<strong class="${isSelected ? '' : 'text-muted'}">${camera.name}</strong>
                </div>
                <div class="col-6 col-md-2">
                    <span class="badge bg-${powerMode === false ? 'warning' : 'success'} small">
                        ${getPowerModeName(powerMode)}
                    </span>
                </div>
                <div class="col-6 col-md-2">
                    <span class="badge ${getPowerWorkingModeClass(powerWorkingMode)} small">
                        ${getPowerWorkingModeName(powerWorkingMode)}
                    </span>
                </div>
                ${batteryCol}
                <div class="${enabledColSize} pe-0">
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
            const selectedCount = this.settings.selectedCameras.length;
            const confirmMessage = selectedCount > 0 
                ? `Are you sure you want to toggle the camera mode for ${selectedCount} selected camera(s)?`
                : 'Are you sure you want to toggle the camera mode for all cameras?';
            
            if (!confirm(confirmMessage)) {
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
            // Prepare request body with selected cameras
            const requestBody = {};
            if (this.settings.selectedCameras && this.settings.selectedCameras.length > 0) {
                requestBody.selectedCameras = this.settings.selectedCameras;
            }
            
            const response = await fetch(`${this.apiBase}/api/cameras/toggle-mode`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
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
            
            // Show initial notification with selection-aware text
            const selectedCount = this.settings.selectedCameras.length;
            const totalAvailableCameras = this.lastDevicesData ? 
                this.lastDevicesData.filter(device => device.type === 'device').length : 
                result.summary.totalCameras;
            
            const isSelectiveMode = selectedCount > 0 && selectedCount < totalAvailableCameras;
            const cameraText = isSelectiveMode 
                ? `${result.summary.totalCameras} selected cameras` 
                : `${result.summary.totalCameras} cameras`;
            this.showNotification(`Toggle command sent to ${cameraText}. Waiting for completion...`, 'info');
            
            // Now wait for all selected cameras to reach their target state
            await this.waitForCameraTransition(result.targetSettings);
            
            // Show final success notification with selection-aware text
            const successText = isSelectiveMode
                ? `Selected cameras successfully transitioned to ${result.targetSettings.powerWorkingMode.name} mode!`
                : `All cameras successfully transitioned to ${result.targetSettings.powerWorkingMode.name} mode!`;
            this.showNotification(successText, 'success');
            
        } catch (error) {
            console.error('Toggle failed:', error);
            this.showNotification(`Toggle failed: ${error.message}`, 'danger');
        } finally {
            this.isToggling = false;
            this.showLoading(false);
        }
    }
    
    async waitForCameraTransition(targetSettings) {
        const maxAttempts = 20; // Maximum number of polling attempts
        const pollInterval = 2000; // 2 seconds between polls
        let attempts = 0;
        
        console.log('Waiting for camera transition to complete...');
        console.log('Target settings:', targetSettings);
        console.log('Selected cameras:', this.settings.selectedCameras);
        
        while (attempts < maxAttempts) {
            attempts++;
            
            try {
                // Poll current device status
                const response = await fetch(`${this.apiBase}/api/devices`);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                let cameras = data.devices.filter(device => device.type === 'device');
                
                // Filter cameras to only include selected ones if camera selection is enabled
                if (this.settings.selectedCameras && this.settings.selectedCameras.length > 0) {
                    cameras = cameras.filter(camera => this.settings.selectedCameras.includes(camera.serialNumber));
                    console.log(`Monitoring ${cameras.length} selected cameras:`, cameras.map(c => c.name));
                }
                
                // Check if all selected cameras have reached target state
                let allCamerasReady = true;
                let transitionedCount = 0;
                let totalCameras = cameras.length;
                
                for (const camera of cameras) {
                    if (camera.properties && camera.properties.motionDetection === true) {
                        const currentPowerMode = camera.properties.powerWorkingMode;
                        const currentAllOtherMotions = camera.properties.motionDetectionTypeAllOtherMotions;
                        const targetPowerMode = targetSettings.powerWorkingMode?.value;
                        const targetAllOtherMotions = targetSettings.allOtherMotions;
                        
                        // Compare values - power mode from our stored values, motion detection from API
                        const powerModeMatches = Number(currentPowerMode) === Number(targetPowerMode);
                        const motionModeMatches = Boolean(currentAllOtherMotions) === Boolean(targetAllOtherMotions);
                        
                        if (powerModeMatches && motionModeMatches) {
                            transitionedCount++;
                        } else {
                            allCamerasReady = false;
                        }
                    } else {
                        // Don't count cameras with no properties or motion detection disabled
                        totalCameras--;
                    }
                }
                
                console.log(`Transition progress: ${transitionedCount}/${totalCameras} selected cameras ready`);
                
                // Update the loading text with progress for selected cameras
                const selectedText = this.settings.selectedCameras && this.settings.selectedCameras.length > 0 
                    ? 'selected ' : '';
                this.updateLoadingText(`Transitioning ${selectedText}cameras... (${transitionedCount}/${totalCameras})`);
                
                // Update camera details with current status
                this.updateCameraStatus(data.devices);
                
                if (allCamerasReady && totalCameras > 0) {
                    console.log('All selected cameras have successfully transitioned!');
                    return; // All selected cameras are in the target state
                }
                
                // Wait before next poll
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                
            } catch (error) {
                console.error(`Polling attempt ${attempts} failed:`, error);
                // Continue trying even if one poll fails
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }
        
        // If we reach here, not all selected cameras transitioned within the timeout
        console.warn('Timeout waiting for all selected cameras to transition');
        throw new Error('Not all selected cameras completed transition within expected time');
    }
    
    updateLoadingText(text) {
        const loadingTextElement = this.loadingOverlay.querySelector('.loading-text');
        if (loadingTextElement) {
            loadingTextElement.textContent = text;
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