#!/bin/sh

# Set default API_BASE_URL if not provided
API_BASE_URL=${API_BASE_URL:-"http://localhost:8080"}

# Create a config.js file with the API base URL
cat > /usr/share/nginx/html/js/config.js << EOF
window.API_CONFIG = {
    baseUrl: '${API_BASE_URL}'
};
EOF

# Execute the original command
exec "$@"
