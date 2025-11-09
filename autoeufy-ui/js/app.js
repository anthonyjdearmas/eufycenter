class CameraModeToggle {
    constructor() {
        this.apiService = new ApiService();
        this.settingsManager = new SettingsManager(this.apiService);
        this.cameraManager = new CameraManager(this.apiService, this.settingsManager);
        this.uiService = new UIService();
        this.audioService = new AudioService();

        this.toggleButton = document.getElementById('cameraToggle');
        this.toggleStatus = document.getElementById('toggleStatus');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.cameraDetails = document.getElementById('cameraDetails');
        this.overrideScheduleButton = document.getElementById('overrideScheduleToggle');
        
        this.isToggling = false;
        this.currentMode = null;
        this.refreshInterval = null;
        
        this.init();
    }

    async init() {
        this.toggleButton.addEventListener('click', () => this.handleToggle());
        this.overrideScheduleButton.addEventListener('click', () => this.handleOverrideScheduleToggle());
        
        await this.settingsManager.loadSettingsFromServer();
        
        this.initializeSettings();
        
        this.updateOverrideScheduleButtonAppearance();
        
        this.checkConnection();
        
        this.setupAutoRefresh();
        
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    cleanup() {
        this.uiService.stopConnectionErrorAlerts();
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
    
    testConnectionError() {
        if (this.uiService.isConnectionError) {
            this.uiService.stopConnectionErrorAlerts();
            this.updateConnectionStatus(true);
            this.uiService.showNotification('Connection error test stopped', 'info');
        } else {
            this.updateConnectionStatus(false, 'Failed to fetch (TEST MODE)');
            this.uiService.showNotification('Testing connection error alerts for 10 seconds...', 'warning');
            
            setTimeout(() => {
                if (this.uiService.isConnectionError) {
                    this.uiService.stopConnectionErrorAlerts();
                    this.updateConnectionStatus(true);
                    this.uiService.showNotification('Connection error test completed', 'success');
                }
            }, 10000);
        }
    }
    
    initializeSettings() {
        this.settingsManager.initializeSettingsUI();
        
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.applySettings();
        });
        
        document.getElementById('testConnectionError').addEventListener('click', () => {
            this.testConnectionError();
        });
        
        document.getElementById('selectAllCameras').addEventListener('click', () => {
            this.cameraManager.selectAllCameras();
        });
        
        document.getElementById('selectNoneCameras').addEventListener('click', () => {
            this.cameraManager.selectNoneCameras();
        });
        
        this.cameraManager.loadCameraSelection();
        
        const settings = this.settingsManager.getSettings();
        if (settings.autoExpandDetails) {
            setTimeout(() => {
                const toggleButton = document.getElementById('toggleCameraList');
                const collapse = new bootstrap.Collapse(document.getElementById('cameraList'));
                collapse.show();
            }, 1000);
        }
        
        this.apiService.setApiBase(settings.apiEndpoint);
    }
    
    async applySettings() {
        const newSettings = this.settingsManager.getSettingsFromUI();
        newSettings.selectedCameras = this.cameraManager.getSelectedCameras();
        
        const settings = this.settingsManager.getSettings();
        const apiChanged = settings.apiEndpoint !== newSettings.apiEndpoint;
        const intervalChanged = settings.refreshInterval !== newSettings.refreshInterval;
        
        this.settingsManager.updateSettings(newSettings);
        const saveSuccess = await this.settingsManager.saveSettings();
        
        if (!saveSuccess) {
            this.uiService.showNotification('Failed to save settings to server', 'danger');
            return;
        }
        
        if (apiChanged) {
            this.apiService.setApiBase(newSettings.apiEndpoint);
            this.checkConnection();
        }
        
        if (intervalChanged) {
            this.setupAutoRefresh();
        }
        
        this.updateToggleButtonState();
        
        this.cameraManager.refreshCameraDetailsDisplay(this.cameraDetails);
        
        const cameraList = document.getElementById('cameraList');
        if (newSettings.autoExpandDetails) {
            if (!cameraList.classList.contains('show')) {
                const collapse = new bootstrap.Collapse(cameraList);
                collapse.show();
            }
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
        modal.hide();
        
        this.uiService.showNotification('Settings saved successfully!', 'success');
    }
    
    setupAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        const settings = this.settingsManager.getSettings();
        this.refreshInterval = setInterval(() => {
            this.checkConnection();
        }, settings.refreshInterval * 1000);
    }

    async checkConnection() {
        try {
            const data = await this.apiService.getDevices();
            this.updateConnectionStatus(true);
            this.updateCameraStatus(data.devices);
            
        } catch (error) {
            this.updateConnectionStatus(false, error.message);
        }
    }

    updateConnectionStatus(connected, error = null) {
        this.uiService.updateConnectionStatus(this.connectionStatus, connected, error);
        
        if (connected) {
            this.updateToggleButtonState();
            this.uiService.stopConnectionErrorAlerts();
        } else {
            this.toggleButton.disabled = true;
            this.toggleStatus.textContent = 'Connection Required';
            
            if (error && error.toLowerCase().includes('failed to fetch')) {
                const settings = this.settingsManager.getSettings();
                this.uiService.startConnectionErrorAlerts(this.audioService, settings.muteConnectionAlerts);
            }
        }
    }

    updateToggleButtonState() {
        const settings = this.settingsManager.getSettings();
        if (settings.overrideSchedule) {
            this.toggleButton.disabled = false;
        } else {
            this.toggleButton.disabled = true;
            this.toggleStatus.textContent = 'Schedule Override Disabled';
        }
    }

    async handleOverrideScheduleToggle() {
        const settings = this.settingsManager.getSettings();
        settings.overrideSchedule = !settings.overrideSchedule;
        this.settingsManager.updateSettings(settings);
        await this.settingsManager.saveSettings();
        
        this.updateOverrideScheduleButtonAppearance();
        this.updateToggleButtonState();
        
        if (settings.overrideSchedule) {
            this.checkConnection();
        }
    }

    updateOverrideScheduleButtonAppearance() {
        const settings = this.settingsManager.getSettings();
        if (settings.overrideSchedule) {
            this.overrideScheduleButton.classList.add('active');
        } else {
            this.overrideScheduleButton.classList.remove('active');
        }
    }

    updateCameraStatus(devices) {
        const result = this.cameraManager.updateCameraStatus(devices);
        if (!result) {
            this.toggleStatus.textContent = 'Error loading camera status';
            return;
        }
        
        const settings = this.settingsManager.getSettings();
        if (settings.overrideSchedule) {
            this.toggleStatus.textContent = result.statusText;
        } else {
            this.toggleStatus.textContent = 'Schedule Override Disabled';
        }
        this.uiService.updateToggleAppearance(this.toggleButton, result.isInBatteryMode);
        this.cameraManager.updateCameraDetails(result.cameras, this.cameraDetails);
    }

    async handleToggle() {
        if (this.isToggling) return;
        
        const settings = this.settingsManager.getSettings();
        
        if (!settings.overrideSchedule) {
            this.uiService.showNotification('Cannot toggle: Schedule Override is disabled. Enable it in settings to use manual control.', 'warning');
            return;
        }
        
        if (settings.confirmActions) {
            const selectedCount = settings.selectedCameras ? settings.selectedCameras.length : 0;
            const confirmMessage = selectedCount > 0 
                ? `Are you sure you want to toggle the camera mode for ${selectedCount} selected camera(s)?`
                : 'Are you sure you want to toggle the camera mode for all cameras?';
            
            if (!confirm(confirmMessage)) {
                return;
            }
        }
        
        this.isToggling = true;
        this.uiService.showLoading(this.loadingOverlay, true);
        
        if (settings.toggleDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, settings.toggleDelay * 1000));
        }
        
        try {
            const lastDevicesData = this.cameraManager.getLastDevicesData();
            if (!lastDevicesData || !Array.isArray(lastDevicesData)) {
                try {
                    await this.checkConnection();
                    if (!this.cameraManager.getLastDevicesData() || !Array.isArray(this.cameraManager.getLastDevicesData())) {
                        throw new Error('No camera data available. Please try refreshing the page.');
                    }
                } catch (connError) {
                    throw new Error('Failed to connect to camera system. Please check your connection.');
                }
            }
            
            const result = await this.apiService.toggleCameraMode(
                settings.selectedCameras && settings.selectedCameras.length > 0 ? settings.selectedCameras : null
            );

            if (!result || !result.summary || !result.targetSettings) {
                throw new Error('Invalid response from server');
            }
            
            const isSelectiveMode = settings.selectedCameras && settings.selectedCameras.length > 0;
            const cameraCount = result.summary.totalCameras;
            const cameraText = isSelectiveMode 
                ? `${cameraCount} selected camera${cameraCount > 1 ? 's' : ''}`
                : `all ${cameraCount} camera${cameraCount > 1 ? 's' : ''}`;
            
            this.uiService.showNotification(`Toggle command sent to ${cameraText}. Waiting for completion...`, 'info');
            
            try {
                await this.cameraManager.waitForCameraTransition(
                    result.targetSettings,
                    this.loadingOverlay,
                    (text, devices) => {
                        this.uiService.updateLoadingText(this.loadingOverlay, text);
                        this.updateCameraStatus(devices);
                    }
                );
                
                const successText = isSelectiveMode
                    ? `${cameraCount} selected camera${cameraCount > 1 ? 's' : ''} successfully transitioned to ${result.targetSettings.powerWorkingMode.name} mode!`
                    : `All ${cameraCount} camera${cameraCount > 1 ? 's' : ''} successfully transitioned to ${result.targetSettings.powerWorkingMode.name} mode!`;
                this.uiService.showNotification(successText, 'success');
            } catch (transitionError) {
                console.error('Camera transition error:', transitionError);
                this.uiService.showNotification(`Command sent successfully, but couldn't verify all cameras completed transition.`, 'warning');
            }
            
            await this.checkConnection();
            
        } catch (error) {
            console.error('Toggle error:', error);
            this.uiService.showNotification(`Toggle failed: ${error.message || 'Unknown error'}`, 'danger');
        } finally {
            this.isToggling = false;
            this.uiService.showLoading(this.loadingOverlay, false);
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    new CameraModeToggle();
});
