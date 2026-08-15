class CameraManager {
    constructor(apiService, settingsManager) {
        this.apiService = apiService;
        this.settingsManager = settingsManager;
        this.lastDevicesData = null;
    }

    async loadCameraSelection() {
        try {
            const data = await this.apiService.getDevices();
            if (!data.devices || !Array.isArray(data.devices)) {
                throw new Error('Invalid device data received from server');
            }
            const cameras = data.devices.filter(device => device.category === 'camera');
            
            this.populateCameraSelection(cameras);
        } catch (error) {
            console.error('Error loading camera selection:', error);
            this.showCameraSelectionError('Failed to load cameras. Please check your connection.');
        }
    }

    populateCameraSelection(cameras) {
        const container = document.getElementById('cameraSelectionContainer');
        const settings = this.settingsManager.getSettings();
        
        if (cameras.length === 0) {
            container.innerHTML = '<div class="col-12 text-center text-muted">No cameras found</div>';
            return;
        }
        
        if (settings.selectedCameras.length === 0) {
            settings.selectedCameras = cameras.map(camera => camera.serialNumber);
            this.settingsManager.updateSettings(settings);
        }
        
        container.innerHTML = '';
        
        cameras.forEach(camera => {
            const isSelected = settings.selectedCameras.includes(camera.serialNumber);
            
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

    updateCameraStatus(devices) {
        if (!devices || !Array.isArray(devices)) {
            console.error('Invalid devices data in updateCameraStatus');
            return null;
        }
        
        this.lastDevicesData = devices;
        let cameras = devices.filter(device => device.category === 'camera');
        
        if (cameras.length === 0) {
            return { statusText: 'No cameras found', isInBatteryMode: false, cameras: [] };
        }

        const settings = this.settingsManager.getSettings();
        let camerasForToggleState = cameras;
        if (settings.selectedCameras && settings.selectedCameras.length > 0) {
            camerasForToggleState = cameras.filter(camera => settings.selectedCameras.includes(camera.serialNumber));
        }

        if (camerasForToggleState.length === 0) {
            return { statusText: 'No selected cameras found', isInBatteryMode: false, cameras: cameras };
        }

        let batteryModeCount = 0;
        let customizedModeCount = 0;
        let allOtherMotionsEnabled = 0;
        let allOtherMotionsDisabled = 0;

        camerasForToggleState.forEach(camera => {
            if (camera.properties && camera.properties.motionDetection === true) {
                const powerWorkingMode = Number(camera.properties.powerWorkingMode || 0);
                if (powerWorkingMode === 0) batteryModeCount++;
                if (powerWorkingMode === 2) customizedModeCount++;
                
                const allOtherMotions = camera.properties.motionDetectionTypeAllOtherMotions;
                if (allOtherMotions === true) allOtherMotionsEnabled++;
                if (allOtherMotions === false) allOtherMotionsDisabled++;
            }
        });

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

        const selectedCount = settings.selectedCameras.length;
        const totalCameras = cameras.length;
        const selectionText = selectedCount > 0 && selectedCount < totalCameras 
            ? ` (${selectedCount}/${totalCameras} selected)`
            : '';

        return {
            statusText: statusText + selectionText,
            isInBatteryMode: isInBatteryMode,
            cameras: cameras
        };
    }

    updateCameraDetails(cameras, cameraDetails) {
        const container = cameraDetails;
        const settings = this.settingsManager.getSettings();
        container.innerHTML = '';

        const headerRow = document.createElement('div');
        headerRow.className = 'row mb-2 align-items-center border-bottom border-secondary pb-2';
        
        const batteryHeaderCol = settings.showBatteryLevels ? `
            <div class="col-6 col-md-2">
                <small class="text-white"><strong>Battery</strong></small>
            </div>
        ` : '';
        
        const nameHeaderColSize = settings.showBatteryLevels ? 'col-12 col-md-4' : 'col-6 col-md-5';

        headerRow.innerHTML = `
            <div class="${nameHeaderColSize}">
                <small class="text-white"><strong>Camera</strong></small>
            </div>
            <div class="col-6 col-md-3">
                <small class="text-white"><strong>Motion Mode</strong></small>
            </div>
            <div class="col-6 col-md-3">
                <small class="text-white"><strong>Power Mode</strong></small>
            </div>
            ${batteryHeaderCol}
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
                const modeNum = Number(mode);
                switch(modeNum) {
                    case 0: return 'Battery Saver Mode';
                    case 1: return 'Optimal Battery';
                    case 2: return 'Customized Recording';
                    default: return mode !== undefined && mode !== null ? `Unknown (${mode})` : 'Unknown';
                }
            };

            const getPowerWorkingModeClass = (mode) => {
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

            const batteryCol = settings.showBatteryLevels ? `
                <div class="col-6 col-md-2">
                    <i class="bi bi-battery"></i> ${batteryLevel}%
                </div>
            ` : '';

            const nameColSize = settings.showBatteryLevels ? 'col-12 col-md-4' : 'col-6 col-md-5';

            const isSelected = !settings.selectedCameras || 
                             settings.selectedCameras.length === 0 || 
                             settings.selectedCameras.includes(camera.serialNumber);
            
            const selectedIndicator = settings.selectedCameras && settings.selectedCameras.length > 0 
                ? (isSelected ? '<i class="bi bi-check-circle-fill text-primary me-1" title="Selected for toggle"></i>' 
                             : '<i class="bi bi-circle text-muted me-1" title="Not selected for toggle"></i>')
                : '';

            row.innerHTML = `
                <div class="${nameColSize}">
                    ${selectedIndicator}<strong class="${isSelected ? '' : 'text-muted'}">${camera.name}</strong>
                </div>
                <div class="col-6 col-md-3">
                    <span class="badge bg-${powerMode === false ? 'warning' : 'success'} small">
                        ${getPowerModeName(powerMode)}
                    </span>
                </div>
                <div class="col-6 col-md-3">
                    <span class="badge ${getPowerWorkingModeClass(powerWorkingMode)} small">
                        ${getPowerWorkingModeName(powerWorkingMode)}
                    </span>
                </div>
                ${batteryCol}
            `;
            
            container.appendChild(row);
        });
    }

    refreshCameraDetailsDisplay(cameraDetails) {
        if (this.lastDevicesData && Array.isArray(this.lastDevicesData)) {
            const cameras = this.lastDevicesData.filter(device => device.category === 'camera');
            this.updateCameraDetails(cameras, cameraDetails);
        } else {
            cameraDetails.innerHTML = '<div class="text-center text-muted">Loading camera details...</div>';
        }
    }

    async waitForCameraTransition(targetSettings, loadingOverlay, onProgress) {
        const maxAttempts = 20;
        const pollInterval = 2000;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            attempts++;
            
            try {
                const data = await this.apiService.getDevices();
                if (!data.devices || !Array.isArray(data.devices)) {
                    console.error('Invalid device data during transition polling');
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    continue;
                }
                
                let cameras = data.devices.filter(device => device.category === 'camera');
                
                const settings = this.settingsManager.getSettings();
                if (settings.selectedCameras && settings.selectedCameras.length > 0) {
                    cameras = cameras.filter(camera => settings.selectedCameras.includes(camera.serialNumber));
                }
                
                let allCamerasReady = true;
                let transitionedCount = 0;
                let totalCameras = cameras.length;
                
                for (const camera of cameras) {
                    if (camera.properties && camera.properties.motionDetection === true) {
                        const currentPowerMode = camera.properties.powerWorkingMode;
                        const currentAllOtherMotions = camera.properties.motionDetectionTypeAllOtherMotions;
                        const targetPowerMode = targetSettings.powerWorkingMode?.value;
                        const targetAllOtherMotions = targetSettings.allOtherMotions;
                        
                        const powerModeMatches = Number(currentPowerMode) === Number(targetPowerMode);
                        const motionModeMatches = Boolean(currentAllOtherMotions) === Boolean(targetAllOtherMotions);
                        
                        if (powerModeMatches && motionModeMatches) {
                            transitionedCount++;
                        } else {
                            allCamerasReady = false;
                        }
                    } else {
                        totalCameras--;
                    }
                }
                
                const selectedText = settings.selectedCameras && settings.selectedCameras.length > 0 
                    ? 'selected ' : '';
                
                if (onProgress) {
                    onProgress(`Transitioning ${selectedText}cameras... (${transitionedCount}/${totalCameras})`, data.devices);
                }
                
                if (allCamerasReady && totalCameras > 0) {
                    return;
                }
                
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }
        
        throw new Error('Not all selected cameras completed transition within expected time');
    }

    getLastDevicesData() {
        return this.lastDevicesData;
    }
}
