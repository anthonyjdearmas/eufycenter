class ApiService {
    constructor() {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isDockerContainer = window.location.hostname === 'eufy-ui';
        
        if (isDockerContainer) {
            this.apiBase = 'http://eufy-api:8080';
        } else {
            this.apiBase = `http://${window.location.hostname}:8080`;
        }
    }

    setApiBase(apiBase) {
        this.apiBase = apiBase;
    }

    getApiBase() {
        return this.apiBase;
    }

    async getDevices() {
        const response = await fetch(`${this.apiBase}/api/devices`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    async getMotionSensors() {
        const response = await fetch(`${this.apiBase}/api/motion-sensors`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    async getSettings() {
        const response = await fetch(`${this.apiBase}/api/settings`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    async saveSettings(settings) {
        const response = await fetch(`${this.apiBase}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }

    async toggleCameraMode(selectedCameras = null) {
        const requestBody = {};
        if (selectedCameras && selectedCameras.length > 0) {
            requestBody.selectedCameras = selectedCameras;
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

        return await response.json();
    }

    connectToMotionEvents() {
        return new EventSource(`${this.apiBase}/api/motion-events`);
    }

    async getSchedules() {
        const response = await fetch(`${this.apiBase}/api/schedules`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }
}
