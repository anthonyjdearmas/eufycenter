// Main JavaScript for EUFY Simple Center

document.addEventListener('DOMContentLoaded', function() {
    console.log('EUFY Simple Center UI loaded');
    
    // Reference to the data container
    const dataContainer = document.getElementById('dataContainer');
    
    // References for new elements
    const toggleAlertBtn = document.getElementById('toggleAlertBtn');
    const terminalLog = document.getElementById('terminalLog');
    const logContent = document.getElementById('logContent');
    
    // Create full alert div but don't add to DOM yet
    const fullAlert = document.createElement('div');
    fullAlert.className = 'full-alert full-alert-hidden';
    fullAlert.innerHTML = '<div><h1>⚠️ FULL ALERT ⚠️</h1><p>System is in alert mode</p><p class="alert-instructions">Press ESC key or click anywhere to exit alert mode</p></div>';
    document.body.appendChild(fullAlert);
    
    // Add click event to dismiss alert
    fullAlert.addEventListener('click', function() {
        if (alertActive) {
            toggleAlert();
        }
    });
    
    // Track alert state
    let alertActive = false;
    
    // API endpoint (adjust as needed)
    const apiUrl = 'http://localhost:3000';
    
    // No longer need fetch data button event listener as the button was removed
    
    // Event listener for toggle alert button
    toggleAlertBtn.addEventListener('click', toggleAlert);
    
    // Add keyboard event listener for ESC key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && alertActive) {
            toggleAlert();
        }
    });
    
    // Add initial log entry
    addLogEntry('System initialized');
    
    // Function to toggle full alert
    function toggleAlert() {
        alertActive = !alertActive;
        
        if (alertActive) {
            fullAlert.classList.remove('full-alert-hidden');
            addLogEntry('ALERT MODE ACTIVATED');
        } else {
            fullAlert.classList.add('full-alert-hidden');
            addLogEntry('Alert mode deactivated');
        }
    }
    
    // Function to add log entry with EST timestamp
    function addLogEntry(message) {
        // Create timestamp in EST
        const now = new Date();
        const estOptions = { 
            timeZone: 'America/New_York',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        };
        const timestamp = now.toLocaleString('en-US', estOptions);
        
        // Create log entry
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
        
        // Add to log content
        logContent.appendChild(entry);
        
        // Auto-scroll to bottom
        terminalLog.scrollTop = terminalLog.scrollHeight;
    }
    
    // Function to fetch data from the API
    function fetchData() {
        // Show loading indicator
        dataContainer.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
        
        // Add log entry
        addLogEntry('Fetching data from API...');
        
        // Fetch data from the API
        fetch(apiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                displayData(data);
                addLogEntry('Data fetched successfully');
            })
            .catch(error => {
                console.error('Error fetching data:', error);
                dataContainer.innerHTML = `
                    <div class="alert alert-danger" role="alert">
                        Error fetching data: ${error.message}
                    </div>
                `;
                addLogEntry(`Error: ${error.message}`);
            });
    }
    
    // Function to display the fetched data
    function displayData(data) {
        // Create HTML to display the data
        const html = `
            <div class="card">
                <div class="card-header">
                    <h3>API Response</h3>
                </div>
                <div class="card-body">
                    <pre class="bg-light p-3">${JSON.stringify(data, null, 2)}</pre>
                </div>
            </div>
        `;
        
        // Update the data container with the HTML
        dataContainer.innerHTML = html;
    }
    
    // Example function to display devices (for future use)
    function displayDevices(devices) {
        if (!devices || devices.length === 0) {
            dataContainer.innerHTML = '<div class="alert alert-info">No devices found.</div>';
            return;
        }
        
        let html = '<div class="row">';
        
        devices.forEach(device => {
            const statusClass = device.online ? 'device-status-online' : 'device-status-offline';
            const statusText = device.online ? 'Online' : 'Offline';
            
            html += `
                <div class="col-md-4 mb-4">
                    <div class="card device-card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">${device.name}</h5>
                            <span class="${statusClass}">${statusText}</span>
                        </div>
                        <div class="card-body">
                            <p><strong>Type:</strong> ${device.type}</p>
                            <p><strong>ID:</strong> ${device.id}</p>
                            <button class="btn btn-sm btn-primary">Control</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        dataContainer.innerHTML = html;
    }
});
