#!/bin/bash

# Configuration
RESTART_INTERVAL=3600  # Time in seconds between restarts

# Get the directory where this script is located
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to handle script termination
cleanup() {
    echo "Script interrupted. Stopping containers..."
    cd "$PROJECT_DIR" && docker compose down
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM to cleanup
trap cleanup SIGINT SIGTERM

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo "Error: Project directory '$PROJECT_DIR' does not exist."
    echo "Please update the PROJECT_DIR variable in this script."
    exit 1
fi

# Check if docker-compose.yml exists
if [ ! -f "$PROJECT_DIR/docker-compose.yml" ] && [ ! -f "$PROJECT_DIR/compose.yml" ]; then
    echo "Error: No docker-compose.yml or compose.yml found in '$PROJECT_DIR'"
    exit 1
fi

echo "Starting Docker Compose restart loop..."
echo "Project directory: $PROJECT_DIR"
echo "Restart interval: $RESTART_INTERVAL seconds"
echo "Press Ctrl+C to stop the script"
echo "----------------------------------------"

# Main loop
while true; do
    echo "$(date): Stopping containers..."
    cd "$PROJECT_DIR"
    
    # Stop the containers
    if docker compose down; then
        echo "$(date): Containers stopped successfully"
    else
        echo "$(date): Error stopping containers"
    fi
    
    echo "$(date): Starting containers..."
    
    # Start the containers
    if docker compose up -d; then
        echo "$(date): Containers started successfully"
    else
        echo "$(date): Error starting containers"
    fi
    
    echo "$(date): Waiting $RESTART_INTERVAL seconds before next restart..."
    echo "----------------------------------------"
    
    # Wait for the configured interval
    sleep $RESTART_INTERVAL
done


# TO KILL IT:
# ps aux | grep restart-services.sh
# kill [process_id]