class UIService {
    constructor() {
        this.isConnectionError = false;
        this.errorFlashInterval = null;
        this.errorSoundInterval = null;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    updateConnectionStatus(connectionStatus, connected, error = null) {
        const icon = connectionStatus.querySelector('i');
        const text = connectionStatus.querySelector('span');
        
        if (connected) {
            icon.className = 'bi bi-circle-fill text-success';
            text.textContent = 'Connected to Eufy System';
        } else {
            icon.className = 'bi bi-circle-fill text-danger';
            text.textContent = error ? `Connection Error: ${error}` : 'Connection Failed';
        }
    }

    startConnectionErrorAlerts(audioService, muteConnectionAlerts) {
        if (this.isConnectionError) return;
        
        this.isConnectionError = true;
        
        document.body.classList.add('connection-error');
        
        this.errorFlashInterval = setInterval(() => {
            document.body.classList.toggle('error-flash');
        }, 1000);
        
        audioService.playConnectionErrorSound(muteConnectionAlerts);
        
        this.errorSoundInterval = setInterval(() => {
            audioService.playConnectionErrorSound(muteConnectionAlerts);
        }, 5000);
    }

    stopConnectionErrorAlerts() {
        if (!this.isConnectionError) return;
        
        this.isConnectionError = false;
        
        document.body.classList.remove('connection-error', 'error-flash');
        
        if (this.errorFlashInterval) {
            clearInterval(this.errorFlashInterval);
            this.errorFlashInterval = null;
        }
        
        if (this.errorSoundInterval) {
            clearInterval(this.errorSoundInterval);
            this.errorSoundInterval = null;
        }
    }

    showLoading(loadingOverlay, show) {
        if (show) {
            loadingOverlay.classList.remove('d-none');
        } else {
            loadingOverlay.classList.add('d-none');
        }
    }

    updateLoadingText(loadingOverlay, text) {
        const loadingTextElement = loadingOverlay.querySelector('.loading-text');
        if (loadingTextElement) {
            loadingTextElement.textContent = text;
        }
    }

    updateToggleAppearance(toggleButton, isBatteryMode) {
        if (isBatteryMode) {
            toggleButton.classList.remove('active');
            toggleButton.classList.add('battery-mode');
        } else {
            toggleButton.classList.add('active');
            toggleButton.classList.remove('battery-mode');
        }
    }
}
