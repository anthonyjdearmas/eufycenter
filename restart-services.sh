#!/bin/bash

# Script to restart Eufy services every 4 hours without rebuilding
# This script should be run via cron job

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Change to the directory containing docker-compose.yml
cd "$SCRIPT_DIR"

# Log the restart attempt
echo "$(date): Restarting Eufy services..." >> restart.log

# Restart the services without rebuilding
docker-compose restart eufy-api eufy-ui

# Check if restart was successful
if [ $? -eq 0 ]; then
    echo "$(date): Services restarted successfully" >> restart.log
else
    echo "$(date): Failed to restart services" >> restart.log
fi 