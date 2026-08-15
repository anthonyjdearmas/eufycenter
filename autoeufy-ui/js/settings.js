class SettingsManager {
    constructor(apiService) {
        this.apiService = apiService;
        this.settings = this.loadDefaultSettings();
    }

    loadDefaultSettings() {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isDockerContainer = window.location.hostname === 'eufy-ui';
        
        let defaultApiEndpoint;
        if (isDockerContainer) {
            defaultApiEndpoint = 'http://eufy-api:8080';
        } else {
            defaultApiEndpoint = `http://${window.location.hostname}:8080`;
        }
        
        return {
            apiEndpoint: defaultApiEndpoint,
            refreshInterval: 30,
            showBatteryLevels: true,
            autoExpandDetails: false,
            soundEffects: false,
            confirmActions: true,
            defaultMode: 'recording',
            toggleDelay: 2,
            muteConnectionAlerts: false,
            selectedCameras: [],
            overrideSchedule: false
        };
    }

    async loadSettingsFromServer() {
        try {
            const data = await this.apiService.getSettings();
            
            if (data.settings && Object.keys(data.settings).length > 0) {
                if (data.settings.selectedCameras && typeof data.settings.selectedCameras === 'string') {
                    try {
                        data.settings.selectedCameras = JSON.parse(data.settings.selectedCameras);
                    } catch (e) {
                        data.settings.selectedCameras = [];
                    }
                }
                
                this.settings = { ...this.settings, ...data.settings };
                console.log('Loaded settings from server:', this.settings);
            } else {
                console.log('No settings found on server, using defaults');
            }
        } catch (error) {
            console.error('Error loading settings from server:', error);
        }
    }

    async saveSettings() {
        try {
            const settingsToSave = { ...this.settings };
            
            if (Array.isArray(settingsToSave.selectedCameras)) {
                settingsToSave.selectedCameras = JSON.stringify(settingsToSave.selectedCameras);
            }
            
            const data = await this.apiService.saveSettings(settingsToSave);
            console.log('Settings saved to server:', data);
            return true;
        } catch (error) {
            console.error('Error saving settings to server:', error);
            return false;
        }
    }

    getSettings() {
        return this.settings;
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    initializeSettingsUI() {
        document.getElementById('apiEndpoint').value = this.settings.apiEndpoint;
        document.getElementById('refreshInterval').value = this.settings.refreshInterval;
        document.getElementById('showBatteryLevels').checked = this.settings.showBatteryLevels;
        document.getElementById('autoExpandDetails').checked = this.settings.autoExpandDetails;
        document.getElementById('soundEffects').checked = this.settings.soundEffects;
        document.getElementById('confirmActions').checked = this.settings.confirmActions;
        document.getElementById('defaultMode').value = this.settings.defaultMode;
        document.getElementById('toggleDelay').value = this.settings.toggleDelay;
        document.getElementById('muteConnectionAlerts').checked = this.settings.muteConnectionAlerts;
    }

    getSettingsFromUI() {
        return {
            apiEndpoint: document.getElementById('apiEndpoint').value,
            refreshInterval: parseInt(document.getElementById('refreshInterval').value),
            showBatteryLevels: document.getElementById('showBatteryLevels').checked,
            autoExpandDetails: document.getElementById('autoExpandDetails').checked,
            soundEffects: document.getElementById('soundEffects').checked,
            confirmActions: document.getElementById('confirmActions').checked,
            defaultMode: document.getElementById('defaultMode').value,
            toggleDelay: parseInt(document.getElementById('toggleDelay').value),
            muteConnectionAlerts: document.getElementById('muteConnectionAlerts').checked
        };
    }
}
